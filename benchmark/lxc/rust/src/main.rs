use axum::{extract::State, routing::get, http::StatusCode, Json, Router};
use serde::Serialize;
use sqlx::{mysql::{MySqlConnectOptions, MySqlPoolOptions}, MySqlPool};
use std::{env, time::Duration};

#[derive(Serialize)]
struct Point { #[serde(rename="dateTime")] date_time: i64, #[serde(rename="outTemp")] out_temp: Option<f64>, rain: Option<f64> }
#[derive(Serialize)]
struct History { data: Vec<Point>, count: usize }
#[derive(Serialize)]
struct Yearly { days: i64, #[serde(rename="meanTemp")] mean_temp: Option<f64>, #[serde(rename="rainSum")] rain_sum: Option<f64> }
#[derive(Clone)]
struct AppState { pool: MySqlPool, end: i64, from: i64, to: i64 }
type ApiResult<T> = Result<Json<T>, (StatusCode,String)>;
fn fail(e: sqlx::Error) -> (StatusCode,String) { eprintln!("SQL failed: {e}"); (StatusCode::SERVICE_UNAVAILABLE,"database query failed".into()) }
fn number(k:&str)->i64 { env::var(k).unwrap_or_else(|_| panic!("missing {k}")).parse().unwrap_or_else(|_| panic!("bad {k}")) }
async fn current(State(st):State<AppState>)->ApiResult<Point>{
    let (ts,t,rain):(i32,Option<f64>,Option<f64>) = sqlx::query_as("SELECT dateTime,outTemp,rain FROM archive WHERE dateTime <= ? ORDER BY dateTime DESC LIMIT 1").bind(st.end).fetch_one(&st.pool).await.map_err(fail)?;
    Ok(Json(Point{date_time:ts as i64,out_temp:t,rain}))
}
async fn history(st:AppState,days:i64)->ApiResult<History>{
    let rows:Vec<(i32,Option<f64>,Option<f64>)> = sqlx::query_as("SELECT dateTime,outTemp,rain FROM archive WHERE dateTime > ? AND dateTime <= ? ORDER BY dateTime")
      .bind(st.end-days*86400).bind(st.end).fetch_all(&st.pool).await.map_err(fail)?;
    let data:Vec<Point>=rows.into_iter().map(|(t,v,r)|Point{date_time:t as i64,out_temp:v,rain:r}).collect();
    Ok(Json(History{count:data.len(),data}))
}
async fn day(State(st):State<AppState>)->ApiResult<History>{history(st,1).await}
async fn month(State(st):State<AppState>)->ApiResult<History>{history(st,30).await}
async fn yearly(State(st):State<AppState>)->ApiResult<Yearly>{
    let (days,mean_temp,rain_sum):(i64,Option<f64>,Option<f64>) = sqlx::query_as("SELECT CAST(COUNT(*) AS SIGNED), ROUND(SUM(t.wsum)/NULLIF(SUM(t.sumtime),0),3), ROUND(SUM(r.sum)*10,3) FROM archive_day_outTemp t JOIN archive_day_rain r USING(dateTime) WHERE t.dateTime>=? AND t.dateTime<?")
     .bind(st.from).bind(st.to).fetch_one(&st.pool).await.map_err(fail)?;
    Ok(Json(Yearly{days,mean_temp,rain_sum}))
}
#[tokio::main]
async fn main(){
    let host=env::var("BENCH_DB_HOST").expect("DB host");let port:u16=env::var("BENCH_DB_PORT").expect("port").parse().unwrap();
    let user=env::var("BENCH_DB_USER").expect("user");let pass=env::var("BENCH_DB_PASSWORD").expect("pass");let dbname=env::var("BENCH_DB_NAME").expect("db");
    let opts=MySqlConnectOptions::new().host(&host).port(port).username(&user).password(&pass).database(&dbname);
    let maxpool:u32=env::var("BENCH_DB_POOL_MAX").unwrap_or_else(|_|"1".into()).parse().expect("DB pool");
    assert!((1..=4).contains(&maxpool));
    let pool=MySqlPoolOptions::new().max_connections(maxpool).min_connections(1).acquire_timeout(Duration::from_secs(5)).connect_with(opts).await.expect("DB connection");
    let (actual,):(String,)=sqlx::query_as("SELECT DATABASE()").fetch_one(&pool).await.expect("identity");
    assert_eq!(actual,dbname,"Wrong database");
    let st=AppState{pool,end:number("BENCH_END_TS"),from:number("BENCH_YEAR_START"),to:number("BENCH_YEAR_END")};
    let app=Router::new().route("/current",get(current)).route("/history/24h",get(day)).route("/history/30d",get(month)).route("/statistics/yearly",get(yearly)).with_state(st);
    let l=tokio::net::TcpListener::bind("127.0.0.1:18121").await.expect("bind");
    eprintln!("Rust API ready, schema={dbname}");
    axum::serve(l,app).await.expect("server")
}
