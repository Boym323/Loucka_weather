package main

import (
  "context"
  "database/sql"
  "encoding/json"
  "log"
  "net/http"
  "os"
  "time"
  _ "github.com/go-sql-driver/mysql"
)

const base int64 = 1767225600
const end int64 = base + 200*86400
type Point struct { DateTime int64 `json:"dateTime"`; OutTemp float64 `json:"outTemp"`; Rain float64 `json:"rain"` }
type History struct { Data []Point `json:"data"`; Count int `json:"count"` }
type Yearly struct { Days int `json:"days"`; MeanTemp float64 `json:"meanTemp"`; RainSum float64 `json:"rainSum"` }

func main() {
  dsn := os.Getenv("BENCH_DSN")
  if dsn == "" {dsn="bench:bench@tcp(127.0.0.1:3306)/weewx?parseTime=true"}
  db,e:=sql.Open("mysql",dsn); if e!=nil {log.Fatal(e)}
  db.SetMaxOpenConns(3); db.SetMaxIdleConns(2); db.SetConnMaxLifetime(3*time.Minute)
  ctx,cancel:=context.WithTimeout(context.Background(),10*time.Second); defer cancel()
  if e=db.PingContext(ctx); e!=nil {log.Fatal(e)}
  mux:=http.NewServeMux()
  mux.HandleFunc("/current",func(w http.ResponseWriter,r *http.Request){
    ctx,cancel:=context.WithTimeout(r.Context(),3*time.Second);defer cancel()
    var p Point
    e:=db.QueryRowContext(ctx,"SELECT dateTime,outTemp,rain FROM archive ORDER BY dateTime DESC LIMIT 1").Scan(&p.DateTime,&p.OutTemp,&p.Rain)
    respond(w,p,e)
  })
  queryHistory:=func(days int64) http.HandlerFunc {return func(w http.ResponseWriter,r *http.Request){
    ctx,cancel:=context.WithTimeout(r.Context(),3*time.Second);defer cancel()
    rows,e:=db.QueryContext(ctx,"SELECT dateTime,outTemp,rain FROM archive WHERE dateTime > ? AND dateTime <= ? ORDER BY dateTime",end-days*86400,end)
    if e!=nil {respond(w,nil,e);return};defer rows.Close()
    points:=make([]Point,0,288*days)
    for rows.Next(){var p Point;if e=rows.Scan(&p.DateTime,&p.OutTemp,&p.Rain);e!=nil{respond(w,nil,e);return};points=append(points,p)}
    respond(w,History{points,len(points)},rows.Err())
  }}
  mux.HandleFunc("/history/24h",queryHistory(1))
  mux.HandleFunc("/history/30d",queryHistory(30))
  mux.HandleFunc("/statistics/yearly",func(w http.ResponseWriter,r *http.Request){
    ctx,cancel:=context.WithTimeout(r.Context(),3*time.Second);defer cancel()
    rows,e:=db.QueryContext(ctx,"SELECT t.wsum,t.sumtime,r.sum FROM archive_day_outTemp t JOIN archive_day_rain r USING(dateTime) WHERE t.dateTime >= ? AND t.dateTime < ? ORDER BY t.dateTime",base,end)
    if e!=nil {respond(w,nil,e);return};defer rows.Close()
    var wsum,sumtime,rains float64; days:=0
    for rows.Next(){var a,b,c float64;if e=rows.Scan(&a,&b,&c);e!=nil{respond(w,nil,e);return};wsum+=a;sumtime+=b;rains+=c;days++}
    if e=rows.Err();e!=nil{respond(w,nil,e);return}
    respond(w,Yearly{days,round3(wsum/sumtime),round3(rains*10)},nil)
  })
  srv:=&http.Server{Addr:"127.0.0.1:8121",Handler:mux,ReadHeaderTimeout:3*time.Second}
  log.Fatal(srv.ListenAndServe())
}
func round3(x float64)float64{if x>=0{return float64(int64(x*1000+0.5))/1000};return float64(int64(x*1000-0.5))/1000}
func respond(w http.ResponseWriter,v any,e error){if e!=nil{http.Error(w,e.Error(),500);return};w.Header().Set("Content-Type","application/json");_ =json.NewEncoder(w).Encode(v)}
