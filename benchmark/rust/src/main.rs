use axum::{extract::State, http::StatusCode, routing::get, Json, Router};
use serde_json::{json, Value};
use sqlx::{mysql::MySqlPoolOptions, MySqlPool};
use std::env;

const BASE: i64 = 1767225600;
const END: i64 = BASE + 200 * 86400;
type Response = Result<Json<Value>, (StatusCode, String)>;

fn fail(err: sqlx::Error) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
}

async fn current(State(pool): State<MySqlPool>) -> Response {
    let (date_time, out_temp, rain): (i32, f64, f64) =
        sqlx::query_as("SELECT dateTime,outTemp,rain FROM archive ORDER BY dateTime DESC LIMIT 1")
            .fetch_one(&pool).await.map_err(fail)?;
    Ok(Json(json!({"dateTime":date_time,"outTemp":out_temp,"rain":rain})))
}

async fn history(pool: MySqlPool, days: i64) -> Response {
    let rows: Vec<(i32, f64, f64)> =
        sqlx::query_as("SELECT dateTime,outTemp,rain FROM archive WHERE dateTime > ? AND dateTime <= ? ORDER BY dateTime")
            .bind(END - days * 86400)
            .bind(END)
            .fetch_all(&pool).await.map_err(fail)?;
    let count = rows.len();
    let data: Vec<Value> = rows.into_iter().map(|(date_time, out_temp, rain)|
        json!({"dateTime":date_time,"outTemp":out_temp,"rain":rain})
    ).collect();
    Ok(Json(json!({"data":data,"count":count})))
}
async fn history24(State(pool): State<MySqlPool>) -> Response { history(pool, 1).await }
async fn history30(State(pool): State<MySqlPool>) -> Response { history(pool, 30).await }

async fn yearly(State(pool): State<MySqlPool>) -> Response {
    let rows: Vec<(f64, i32, f64)> =
        sqlx::query_as("SELECT t.wsum,t.sumtime,r.sum FROM archive_day_outTemp t JOIN archive_day_rain r USING(dateTime) WHERE t.dateTime >= ? AND t.dateTime < ? ORDER BY t.dateTime")
            .bind(BASE).bind(END)
            .fetch_all(&pool).await.map_err(fail)?;
    let days = rows.len();
    let (mut wsum, mut sumtime, mut rain_sum) = (0.0, 0.0, 0.0);
    for (w, s, r) in rows { wsum += w; sumtime += s as f64; rain_sum += r; }
    let temp = (wsum / sumtime * 1000.0).round() / 1000.0;
    let rain = (rain_sum * 10.0 * 1000.0).round() / 1000.0;
    Ok(Json(json!({"days":days,"meanTemp":temp,"rainSum":rain})))
}

#[tokio::main]
async fn main() {
    let url = env::var("DATABASE_URL").unwrap_or_else(|_| "mysql://bench:bench@127.0.0.1:3306/weewx".into());
    let pool = MySqlPoolOptions::new().max_connections(3)
        .connect(&url).await.expect("MariaDB connection");
    let app = Router::new()
        .route("/current", get(current))
        .route("/history/24h", get(history24))
        .route("/history/30d", get(history30))
        .route("/statistics/yearly", get(yearly))
        .with_state(pool);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:8121").await.expect("bind");
    axum::serve(listener, app).await.expect("server");
}
