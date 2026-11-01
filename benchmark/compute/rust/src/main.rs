use std::collections::BTreeMap;
use std::env;
use std::fmt::Write as _;
use std::fs;
use std::time::Instant;

#[derive(Default)]
struct Stats {
    rows: u64, reconstructed: u64, minutes: u64,
    temp_minutes: u64, rain_n: u64, wind_n: u64, wind_minutes: u64,
    humid_n: u64, humid_minutes: u64,
    temp_sum: f64, rain_sum: f64, wind_sin: f64, wind_cos: f64, humid_sum: f64,
    temp_min: Option<f64>, temp_max: Option<f64>,
}
impl Stats {
    fn add(&mut self, p: &[&str]) {
        let minutes: u64 = p[1].parse().expect("invalid interval");
        self.rows += 1;
        if p[8] == "R" { self.reconstructed += 1; }
        self.minutes += minutes;
        let m = minutes as f64;
        if p[3] != "-" {
            let v: f64 = p[3].parse().expect("invalid temperature");
            self.temp_sum += v*m;
            self.temp_minutes += minutes;
            self.temp_min = Some(self.temp_min.map_or(v, |a| a.min(v)));
            self.temp_max = Some(self.temp_max.map_or(v, |a| a.max(v)));
        }
        if p[4] != "-" {
            self.rain_n += 1;
            self.rain_sum += p[4].parse::<f64>().expect("invalid rain");
        }
        if p[5] != "-" && p[6] != "-" {
            let speed: f64 = p[5].parse().expect("invalid wind speed");
            let angle: f64 = p[6].parse::<f64>().expect("invalid wind direction").to_radians();
            self.wind_n += 1;
            self.wind_sin += angle.sin()*speed*m;
            self.wind_cos += angle.cos()*speed*m;
            self.wind_minutes += minutes;
        }
        if p[7] != "-" {
            self.humid_n += 1;
            self.humid_minutes += minutes;
            self.humid_sum += p[7].parse::<f64>().expect("invalid humidity")*m;
        }
    }
    fn json(&self) -> String {
        let mut out = String::with_capacity(320);
        let h = self.wind_sin.hypot(self.wind_cos);
        let direction = if h > 1e-9 { Some(self.wind_sin.atan2(self.wind_cos).to_degrees().rem_euclid(360.)) } else { None };
        write!(out,"{{\"rows\":{},\"reconstructed\":{},\"minutes\":{},\"tempMinutes\":{},\"tempC\":{},\"tempMin\":{},\"tempMax\":{},\"rainN\":{},\"rainMm\":{},\"windN\":{},\"windVectorMs\":{},\"windDir\":{},\"humidN\":{},\"humidPct\":{}}}",
            self.rows,self.reconstructed,self.minutes,self.temp_minutes,
            fmt_opt(if self.temp_minutes>0 {Some(self.temp_sum/self.temp_minutes as f64)}else{None}),
            fmt_opt(self.temp_min),fmt_opt(self.temp_max),self.rain_n,
            fmt_opt(if self.rain_n>0{Some(self.rain_sum)}else{None}),
            self.wind_n,fmt_opt(if self.wind_minutes>0{Some(h/self.wind_minutes as f64)}else{None}),
            fmt_opt(direction),self.humid_n,
            fmt_opt(if self.humid_minutes>0{Some(self.humid_sum/self.humid_minutes as f64)}else{None})
        ).expect("json format");
        out
    }
}
fn fmt_opt(v:Option<f64>)->String {match v {Some(x) if x.is_finite()=>x.to_string(),_=>"null".to_string()}}
fn append_group(out:&mut String, groups:&BTreeMap<String,Stats>) {
    out.push('{');
    let mut first=true;
    for (key,value) in groups {
        if !first {out.push(',');}first=false;
        write!(out,"\"{}\":{}",key,value.json()).expect("format");
    }
    out.push('}');
}
struct Result {total:Stats,daily:BTreeMap<String,Stats>,monthly:BTreeMap<String,Stats>,yearly:BTreeMap<String,Stats>}
fn compute(raw:&str)->Result {
    let mut daily:BTreeMap<String,Stats>=BTreeMap::new();
    let mut monthly:BTreeMap<String,Stats>=BTreeMap::new();
    let mut yearly:BTreeMap<String,Stats>=BTreeMap::new();
    let mut total=Stats::default();
    for line in raw.lines().skip(1) {
        if line.is_empty() {continue;}
        let p:Vec<&str>=line.split('\t').collect();
        if p.len()!=9 {panic!("bad row")}
        let day=p[2];
        assert_eq!(day.len(),10,"bad localDay");
        daily.entry(day.to_string()).or_default().add(&p);
        monthly.entry(day[..7].to_string()).or_default().add(&p);
        yearly.entry(day[..4].to_string()).or_default().add(&p);
        total.add(&p);
    }
    Result{total,daily,monthly,yearly}
}
fn serialize(result:&Result)->String {
    let mut out=String::new();
    out.push_str("{\"total\":");out.push_str(&result.total.json());
    out.push_str(",\"daily\":");append_group(&mut out,&result.daily);
    out.push_str(",\"monthly\":");append_group(&mut out,&result.monthly);
    out.push_str(",\"yearly\":");append_group(&mut out,&result.yearly);
    out.push('}');out
}
fn main(){
    let args:Vec<String>=env::args().collect();
    if args.len()!=3 {eprintln!("usage: loucka-stats-bench DATA.tsv ITERATIONS");std::process::exit(2)}
    let raw=fs::read_to_string(&args[1]).expect("cannot open TSV");
    let iterations:usize=args[2].parse().expect("invalid iterations");
    assert!((1..=100).contains(&iterations),"iterations 1..100");
    let t=Instant::now();let mut result:Option<Result>=None;
    for _ in 0..iterations {result=Some(compute(&raw))}
    let ms=t.elapsed().as_secs_f64()*1000.0/iterations as f64;
    let json=serialize(result.as_ref().expect("empty result"));
    println!("{{\"backend\":\"rust\",\"iterations\":{},\"ms_per_iteration\":{},\"result\":{}}}",iterations,ms,json);
}
