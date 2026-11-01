package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	mysql "github.com/go-sql-driver/mysql"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"time"
)

type Point struct {
	DateTime int64    `json:"dateTime"`
	OutTemp  *float64 `json:"outTemp"`
	Rain     *float64 `json:"rain"`
}
type History struct {
	Data  []Point `json:"data"`
	Count int     `json:"count"`
}
type Yearly struct {
	Days     int64    `json:"days"`
	MeanTemp *float64 `json:"meanTemp"`
	RainSum  *float64 `json:"rainSum"`
}

func numericEnv(name string) int64 {
	v, e := strconv.ParseInt(os.Getenv(name), 10, 64)
	if e != nil {
		log.Fatalf("invalid %s: %v", name, e)
	}
	return v
}
func nullable(x sql.NullFloat64) *float64 {
	if !x.Valid {
		return nil
	}
	v := x.Float64
	return &v
}
func reply(w http.ResponseWriter, v any, e error) {
	if e != nil {
		log.Printf("query error: %v", e)
		http.Error(w, "database query failed", 503)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func main() {
	port, err := strconv.Atoi(os.Getenv("BENCH_DB_PORT"))
	if err != nil {
		log.Fatal(err)
	}
	cfg := mysql.NewConfig()
	cfg.User = os.Getenv("BENCH_DB_USER")
	cfg.Passwd = os.Getenv("BENCH_DB_PASSWORD")
	cfg.Net = "tcp"
	cfg.Addr = net.JoinHostPort(os.Getenv("BENCH_DB_HOST"), strconv.Itoa(port))
	cfg.DBName = os.Getenv("BENCH_DB_NAME")
	cfg.Timeout = 3 * time.Second
	cfg.ReadTimeout = 5 * time.Second
	cfg.WriteTimeout = 5 * time.Second
	db, err := sql.Open("mysql", cfg.FormatDSN())
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	poolSize := 1
    if raw := os.Getenv("BENCH_DB_POOL_MAX"); raw != "" {
        parsed, parseErr := strconv.Atoi(raw)
        if parseErr != nil || parsed < 1 || parsed > 4 { log.Fatal("invalid BENCH_DB_POOL_MAX") }
        poolSize = parsed
    }
    db.SetMaxOpenConns(poolSize)
	db.SetMaxIdleConns(poolSize)
	db.SetConnMaxLifetime(3 * time.Minute)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err = db.PingContext(ctx); err != nil {
		log.Fatal(err)
	}
	var schema string
	if err = db.QueryRowContext(ctx, "SELECT DATABASE()").Scan(&schema); err != nil {
		log.Fatal(err)
	}
	if schema != os.Getenv("BENCH_DB_NAME") {
		log.Fatalf("unexpected database %q", schema)
	}
	end := numericEnv("BENCH_END_TS")
	yearStart := numericEnv("BENCH_YEAR_START")
	yearEnd := numericEnv("BENCH_YEAR_END")
	mux := http.NewServeMux()
	mux.HandleFunc("GET /current", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
		defer cancel()
		var ts int64
		var t, rain sql.NullFloat64
		e := db.QueryRowContext(ctx, "SELECT dateTime,outTemp,rain FROM archive WHERE dateTime <= ? ORDER BY dateTime DESC LIMIT 1", end).Scan(&ts, &t, &rain)
		if errors.Is(e, sql.ErrNoRows) {
			http.Error(w, "no data", 404)
			return
		}
		reply(w, Point{ts, nullable(t), nullable(rain)}, e)
	})
	history := func(days int64) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
			defer cancel()
			rows, e := db.QueryContext(ctx, "SELECT dateTime,outTemp,rain FROM archive WHERE dateTime > ? AND dateTime <= ? ORDER BY dateTime", end-days*86400, end)
			if e != nil {
				reply(w, nil, e)
				return
			}
			defer rows.Close()
			items := make([]Point, 0, int(days*288))
			for rows.Next() {
				var ts int64
				var t, rain sql.NullFloat64
				if e = rows.Scan(&ts, &t, &rain); e != nil {
					reply(w, nil, e)
					return
				}
				items = append(items, Point{ts, nullable(t), nullable(rain)})
			}
			reply(w, History{items, len(items)}, rows.Err())
		}
	}
	mux.HandleFunc("GET /history/24h", history(1))
	mux.HandleFunc("GET /history/30d", history(30))
	mux.HandleFunc("GET /statistics/yearly", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
		defer cancel()
		var days int64
		var temp, rain sql.NullFloat64
		e := db.QueryRowContext(ctx, "SELECT CAST(COUNT(*) AS SIGNED), ROUND(SUM(t.wsum)/NULLIF(SUM(t.sumtime),0),3), ROUND(SUM(r.sum)*10,3) FROM archive_day_outTemp t JOIN archive_day_rain r USING(dateTime) WHERE t.dateTime>=? AND t.dateTime<?", yearStart, yearEnd).Scan(&days, &temp, &rain)
		reply(w, Yearly{days, nullable(temp), nullable(rain)}, e)
	})
	srv := &http.Server{Addr: "127.0.0.1:18121", Handler: mux, ReadHeaderTimeout: 3 * time.Second}
	log.Printf("Go API ready, schema=%s", schema)
	log.Fatal(srv.ListenAndServe())
}
