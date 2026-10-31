package main
import("fmt";"os";"strings";"strconv";"time";"math";"sort";"encoding/json")
type Stats struct {Rows,Reconstructed,Minutes,TempMinutes,RainN,WindN,WindMinutes,HumidN,HumidMinutes int; TempSum,RainSum,WindSin,WindCos,HumidSum float64; TempMin,TempMax *float64}
func num(s string)float64 {v,e:=strconv.ParseFloat(s,64);if e!=nil {panic(e)};return v}
func (a *Stats)Add(p []string){m,e:=strconv.Atoi(p[1]);if e!=nil{panic(e)};a.Rows++;if p[8]=="R"{a.Reconstructed++};a.Minutes+=m
 if p[3]!="-"{v:=num(p[3]);a.TempSum+=v*float64(m);a.TempMinutes+=m;if a.TempMin==nil||v<*a.TempMin{w:=v;a.TempMin=&w};if a.TempMax==nil||v>*a.TempMax{w:=v;a.TempMax=&w}}
 if p[4]!="-"{a.RainN++;a.RainSum+=num(p[4])}
 if p[5]!="-"&&p[6]!="-"{speed:=num(p[5]);r:=num(p[6])*math.Pi/180;a.WindN++;a.WindSin+=math.Sin(r)*speed*float64(m);a.WindCos+=math.Cos(r)*speed*float64(m);a.WindMinutes+=m}
 if p[7]!="-"{a.HumidN++;a.HumidMinutes+=m;a.HumidSum+=num(p[7])*float64(m)}
}
type Summary struct {Rows int `json:"rows"`; Reconstructed int `json:"reconstructed"`; Minutes int `json:"minutes"`;TempMinutes int `json:"tempMinutes"`;TempC *float64 `json:"tempC"`;TempMin *float64 `json:"tempMin"`;TempMax *float64 `json:"tempMax"`;RainN int `json:"rainN"`;RainMm *float64 `json:"rainMm"`;WindN int `json:"windN"`;WindVectorMs *float64 `json:"windVectorMs"`;WindDir *float64 `json:"windDir"`;HumidN int `json:"humidN"`;HumidPct *float64 `json:"humidPct"`}
func ptr(x float64)*float64{return &x}
func (a *Stats)Clean()Summary {r:=Summary{Rows:a.Rows,Reconstructed:a.Reconstructed,Minutes:a.Minutes,TempMinutes:a.TempMinutes,TempMin:a.TempMin,TempMax:a.TempMax,RainN:a.RainN,WindN:a.WindN,HumidN:a.HumidN};if a.TempMinutes>0{r.TempC=ptr(a.TempSum/float64(a.TempMinutes))};if a.RainN>0{r.RainMm=ptr(a.RainSum)};h:=math.Hypot(a.WindSin,a.WindCos);if a.WindMinutes>0{r.WindVectorMs=ptr(h/float64(a.WindMinutes))};if h>1e-9{r.WindDir=ptr(math.Mod(math.Mod(math.Atan2(a.WindSin,a.WindCos)*180/math.Pi,360)+360,360))};if a.HumidMinutes>0{r.HumidPct=ptr(a.HumidSum/float64(a.HumidMinutes))};return r}
type Result struct {Total Summary `json:"total"`;Daily map[string]Summary `json:"daily"`;Monthly map[string]Summary `json:"monthly"`;Yearly map[string]Summary `json:"yearly"`}
func add(t map[string]*Stats,key string,p []string){a:=t[key];if a==nil{a=&Stats{};t[key]=a};a.Add(p)}
func cleanMap(t map[string]*Stats)map[string]Summary{v:=make(map[string]Summary,len(t));keys:=make([]string,0,len(t));for k:=range t{keys=append(keys,k)};sort.Strings(keys);for _,k:=range keys{v[k]=t[k].Clean()};return v}
func compute(raw string)Result{d,m,y:=map[string]*Stats{},map[string]*Stats{},map[string]*Stats{};total:=&Stats{};lines:=strings.Split(raw,"\n");for i:=1;i<len(lines);i++{if lines[i]==""{continue};p:=strings.Split(strings.TrimSuffix(lines[i],"\r"),"\t");if len(p)!=9{panic("bad row")};day:=p[2];add(d,day,p);add(m,day[:7],p);add(y,day[:4],p);total.Add(p)};return Result{total.Clean(),cleanMap(d),cleanMap(m),cleanMap(y)}}
func main(){raw,e:=os.ReadFile(os.Args[1]);if e!=nil{panic(e)};its,e:=strconv.Atoi(os.Args[2]);if e!=nil||its<1{panic("iterations must be >0")};start:=time.Now();var result Result;for i:=0;i<its;i++{result=compute(string(raw))};ms:=float64(time.Since(start).Nanoseconds())/1e6/float64(its);out:=map[string]any{"backend":"go","iterations":its,"ms_per_iteration":ms,"result":result};b,e:=json.Marshal(out);if e!=nil{panic(e)};fmt.Println(string(b))}
