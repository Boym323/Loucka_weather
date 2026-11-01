// Read-only C++ benchmark: libmicrohttpd + MariaDB Connector/C + nlohmann/json.
// Binds only to 127.0.0.1; max DB connections controlled by BENCH_DB_POOL_MAX.
#include <microhttpd.h>
#include <mysql.h>
#include <nlohmann/json.hpp>
#include <arpa/inet.h>
#include <atomic>
#include <charconv>
#include <chrono>
#include <condition_variable>
#include <csignal>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <mutex>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>
#include <thread>
#include <vector>

using json = nlohmann::json;
using Row = std::vector<std::optional<std::string>>;
using Rows = std::vector<Row>;
static std::atomic<bool> stop_requested{false};
static void stop_signal(int) { stop_requested.store(true); }

std::string required(const char *name) {
    const char *v = std::getenv(name);
    if (!v || !*v) throw std::runtime_error(std::string("Missing ") + name);
    return v;
}
long long number(const char *name) {
    auto s = required(name);
    long long n = 0;
    auto r = std::from_chars(s.data(), s.data()+s.size(), n);
    if (r.ec != std::errc{} || r.ptr != s.data()+s.size())
        throw std::runtime_error(std::string("Bad integer: ") + name);
    return n;
}

class Pool {
    std::vector<MYSQL*> all_;
    std::vector<MYSQL*> free_;
    std::mutex mu_;
    std::condition_variable cv_;
public:
    explicit Pool(int max_conn) {
        std::string host = required("BENCH_DB_HOST"), user = required("BENCH_DB_USER"),
                    password = required("BENCH_DB_PASSWORD"), schema = required("BENCH_DB_NAME");
        auto port = static_cast<unsigned>(number("BENCH_DB_PORT"));
        try {
            for (int i = 0; i < max_conn; ++i) {
                MYSQL *db = mysql_init(nullptr);
                if (!db) throw std::runtime_error("mysql_init failed");
                unsigned int timeout = 5;
                mysql_options(db, MYSQL_OPT_CONNECT_TIMEOUT, &timeout);
                mysql_options(db, MYSQL_OPT_READ_TIMEOUT, &timeout);
                mysql_options(db, MYSQL_OPT_WRITE_TIMEOUT, &timeout);
                if (!mysql_real_connect(db, host.c_str(), user.c_str(), password.c_str(),
                                        schema.c_str(), port, nullptr, 0)) {
                    std::string error = mysql_error(db);
                    mysql_close(db);
                    throw std::runtime_error("MariaDB connect failed: " + error);
                }
                all_.push_back(db);
                free_.push_back(db);
            }
            auto check = query("SELECT DATABASE()");
            if (check.empty() || !check[0][0] || *check[0][0] != schema)
                throw std::runtime_error("Unexpected DB schema");
        } catch (...) {
            for (auto *db : all_) mysql_close(db);
            all_.clear();free_.clear();
            throw;
        }
    }
    ~Pool() { for (auto *db : all_) mysql_close(db); }
    Pool(const Pool &) = delete;
    Pool &operator=(const Pool &) = delete;
    Rows query(const std::string &sql) {
        MYSQL* db = nullptr;
        {
            std::unique_lock<std::mutex> lock(mu_);
            cv_.wait(lock, [&]{return !free_.empty();});
            db = free_.back(); free_.pop_back();
        }
        // Return the connection on every path, including mysql_query/store errors.
        auto putback = [&]{
            {std::lock_guard<std::mutex> lock(mu_); free_.push_back(db);}
            cv_.notify_one();
        };
        try {
            if (mysql_real_query(db, sql.data(), sql.size()) != 0)
                throw std::runtime_error(mysql_error(db));
            MYSQL_RES* result = mysql_store_result(db);
            if (!result) throw std::runtime_error(mysql_error(db));
            Rows result_rows;
            auto cols = mysql_num_fields(result);
            MYSQL_ROW r;
            while ((r = mysql_fetch_row(result))) {
                unsigned long* lengths = mysql_fetch_lengths(result);
                Row cells;
                cells.reserve(cols);
                for (unsigned i=0; i<cols; ++i) {
                    if (r[i]) cells.emplace_back(std::string(r[i], lengths[i]));
                    else cells.emplace_back(std::nullopt);
                }
                result_rows.emplace_back(std::move(cells));
            }
            mysql_free_result(result);
            putback();
            return result_rows;
        } catch (...) { putback(); throw; }
    }
};

struct Context { Pool &db; long long end, year_start, year_end; };
static json val(const std::optional<std::string> &v) {
    if (!v) return nullptr;
    return std::stod(*v);
}
static json point(const Row &r) {
    return {{"dateTime", std::stoll(*r.at(0))}, {"outTemp", val(r.at(1))}, {"rain", val(r.at(2))}};
}
static json handle(Context &ctx, std::string_view path) {
    if (path == "/current") {
        const auto rows = ctx.db.query("SELECT dateTime,outTemp,rain FROM archive WHERE dateTime <= " + std::to_string(ctx.end) + " ORDER BY dateTime DESC LIMIT 1");
        if (rows.empty()) throw std::runtime_error("No current row");
        return point(rows.front());
    }
    if (path == "/history/24h" || path == "/history/30d") {
        const long long days = path == "/history/24h" ? 1 : 30;
        const auto rows = ctx.db.query("SELECT dateTime,outTemp,rain FROM archive WHERE dateTime > " + std::to_string(ctx.end - days*86400) + " AND dateTime <= " + std::to_string(ctx.end) + " ORDER BY dateTime");
        json data = json::array();
        for (const auto &r : rows) data.push_back(point(r));
        return {{"data", std::move(data)}, {"count", rows.size()}};
    }
    if (path == "/statistics/yearly") {
        const auto rows = ctx.db.query("SELECT CAST(COUNT(*) AS SIGNED), ROUND(SUM(t.wsum)/NULLIF(SUM(t.sumtime),0),3), ROUND(SUM(r.sum)*10,3) FROM archive_day_outTemp t JOIN archive_day_rain r USING(dateTime) WHERE t.dateTime >= " + std::to_string(ctx.year_start) + " AND t.dateTime < " + std::to_string(ctx.year_end));
        if (rows.empty()) throw std::runtime_error("No yearly aggregate");
        return {{"days", std::stoll(*rows[0][0])}, {"meanTemp", val(rows[0][1])}, {"rainSum", val(rows[0][2])}};
    }
    throw std::invalid_argument("Unknown route");
}

static enum MHD_Result callback(void *cls, struct MHD_Connection *connection,
    const char *url, const char *method, const char *, const char *,
    size_t *upload_data_size, void **con_cls) {
    static int sentinel;
    if (std::strcmp(method, "GET") != 0) return MHD_NO;
    if (*con_cls != &sentinel) { *con_cls = &sentinel; return MHD_YES; }
    if (*upload_data_size) return MHD_NO;
    *con_cls = nullptr;
    std::string payload;
    unsigned int code = MHD_HTTP_OK;
    try { payload = handle(*static_cast<Context*>(cls), url).dump(); }
    catch (const std::invalid_argument&) {code=MHD_HTTP_NOT_FOUND; payload="{\"error\":\"unknown endpoint\"}";}
    catch (const std::exception &e) {
        std::cerr << "C++ API query failed: " << e.what() << std::endl;
        code=MHD_HTTP_SERVICE_UNAVAILABLE;
        payload="{\"error\":\"database query failed\"}";
    }
    auto *resp = MHD_create_response_from_buffer(payload.size(), payload.data(), MHD_RESPMEM_MUST_COPY);
    if (!resp) return MHD_NO;
    MHD_add_response_header(resp, MHD_HTTP_HEADER_CONTENT_TYPE, "application/json");
    auto answer = MHD_queue_response(connection, code, resp);
    MHD_destroy_response(resp);
    return answer;
}
int main() {
    try {
        long long pool_size = 1;
        if (const char* pool_env = std::getenv("BENCH_DB_POOL_MAX"); pool_env && *pool_env) pool_size=number("BENCH_DB_POOL_MAX");
        if (pool_size < 1 || pool_size > 8) throw std::runtime_error("DB pool must be 1..8");
        const auto port = static_cast<unsigned short>(std::getenv("BENCH_HTTP_PORT") ? number("BENCH_HTTP_PORT") : 18121);
        if (mysql_library_init(0,nullptr,nullptr)) throw std::runtime_error("mysql_library_init failed");
        Pool pool(static_cast<int>(pool_size));
        Context context{pool,number("BENCH_END_TS"),number("BENCH_YEAR_START"),number("BENCH_YEAR_END")};
        sockaddr_in bind_addr{};
        bind_addr.sin_family=AF_INET;
        bind_addr.sin_port=htons(port);
        bind_addr.sin_addr.s_addr=htonl(INADDR_LOOPBACK);
        auto *daemon = MHD_start_daemon(MHD_USE_INTERNAL_POLLING_THREAD | MHD_USE_THREAD_PER_CONNECTION,
            port, nullptr, nullptr, &callback, &context,
            MHD_OPTION_SOCK_ADDR, reinterpret_cast<sockaddr*>(&bind_addr),
            MHD_OPTION_CONNECTION_TIMEOUT, static_cast<unsigned int>(20),
            MHD_OPTION_END);
        if (!daemon) throw std::runtime_error("MHD bind failed");
        std::signal(SIGTERM, stop_signal);
        std::signal(SIGINT, stop_signal);
        std::cerr << "C++ API ready pool=" << pool_size << std::endl;
        while (!stop_requested.load()) std::this_thread::sleep_for(std::chrono::milliseconds(100));
        MHD_stop_daemon(daemon);
        return 0;
    } catch (const std::exception &e) {
        std::cerr << "C++ start failure: " << e.what() << std::endl;
        return 1;
    }
}
