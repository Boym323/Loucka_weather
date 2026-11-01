#include <algorithm>
#include <array>
#include <charconv>
#include <chrono>
#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
using namespace std;
constexpr double PI=3.1415926535897932384626433832795;
struct Agg {
    long long rows=0, reconstructed=0, minutes=0, tempMinutes=0, rainN=0,windN=0,windMinutes=0,humidN=0,humidMinutes=0;
    double tempSum=0,rainSum=0,windSin=0,windCos=0,humidSum=0,tempMin=0,tempMax=0;
    bool hasTemp=false;
    void add(const array<string_view,9>& p){
        int m=stoi(string(p[1]));++rows;reconstructed+=(p[8]=="R");minutes+=m;
        if(p[3]!="-"){
            double v=stod(string(p[3]));tempSum+=v*m;tempMinutes+=m;
            if(!hasTemp){tempMin=tempMax=v;hasTemp=true;}else{tempMin=min(tempMin,v);tempMax=max(tempMax,v);}
        }
        if(p[4]!="-"){++rainN;rainSum+=stod(string(p[4]));}
        if(p[5]!="-" && p[6]!="-"){
            double speed=stod(string(p[5])),angle=stod(string(p[6]))*PI/180;
            ++windN;windSin+=sin(angle)*speed*m;windCos+=cos(angle)*speed*m;windMinutes+=m;
        }
        if(p[7]!="-"){++humidN;humidMinutes+=m;humidSum+=stod(string(p[7]))*m;}
    }
};
string summary(const Agg& a){
    ostringstream o;o<<setprecision(16);
    o<<"{\"rows\":"<<a.rows<<",\"reconstructed\":"<<a.reconstructed<<",\"minutes\":"<<a.minutes;
    o<<",\"tempMinutes\":"<<a.tempMinutes<<",\"tempC\":";
    if(a.tempMinutes)o<<a.tempSum/a.tempMinutes;else o<<"null";
    o<<",\"tempMin\":";if(a.hasTemp)o<<a.tempMin;else o<<"null";
    o<<",\"tempMax\":";if(a.hasTemp)o<<a.tempMax;else o<<"null";
    o<<",\"rainN\":"<<a.rainN<<",\"rainMm\":";if(a.rainN)o<<a.rainSum;else o<<"null";
    double h=hypot(a.windSin,a.windCos);
    o<<",\"windN\":"<<a.windN<<",\"windVectorMs\":";
    if(a.windMinutes)o<<h/a.windMinutes;else o<<"null";
    o<<",\"windDir\":";
    if(h>1e-9){double dir=fmod(fmod(atan2(a.windSin,a.windCos)*180/PI,360.)+360.,360.);o<<dir;}else o<<"null";
    o<<",\"humidN\":"<<a.humidN<<",\"humidPct\":";
    if(a.humidMinutes)o<<a.humidSum/a.humidMinutes;else o<<"null";
    o<<'}';return o.str();
}
string group(const map<string,Agg>& a){string r="{";bool first=true;for(const auto&[k,v]:a){if(!first)r+=',';first=false;r+='"'+k+'"';r+=':';r+=summary(v);}return r+'}';}
struct Result {Agg total;map<string,Agg> daily,monthly,yearly;};
Result compute(const string& raw){
    map<string,Agg> d,m,y;Agg total;
    size_t cur=raw.find('\n');if(cur==string::npos)throw runtime_error("missing header");++cur;
    while(cur<raw.size()){
        size_t end=raw.find('\n',cur);if(end==string::npos)end=raw.size();
        auto row=string_view(raw).substr(cur,end-cur);
        if(!row.empty()&&row.back()=='\r')row.remove_suffix(1);
        if(!row.empty()){
            array<string_view,9> p;size_t pos=0;
            for(int i=0;i<8;i++){
                auto j=row.find('\t',pos);if(j==string_view::npos)throw runtime_error("invalid TSV row");
                p[i]=row.substr(pos,j-pos);pos=j+1;
            }
            p[8]=row.substr(pos);if(p[8].find('\t')!=string_view::npos)throw runtime_error("invalid field count");
            string day(p[2]);if(day.size()!=10)throw runtime_error("invalid day");
            d[day].add(p);m[day.substr(0,7)].add(p);y[day.substr(0,4)].add(p);total.add(p);
        }
        cur=end+1;
    }
    return Result{std::move(total),std::move(d),std::move(m),std::move(y)};
}
int main(int argc,char**argv){try{
    if(argc!=3)throw runtime_error("usage: benchmark DATA.tsv ITERATIONS");
    ifstream input(argv[1],ios::binary);if(!input)throw runtime_error("cannot read input");
    string raw((istreambuf_iterator<char>(input)),istreambuf_iterator<char>());
    int its=stoi(argv[2]);if(its<1||its>100)throw runtime_error("invalid iterations");
    auto start=chrono::steady_clock::now();Result result;
    for(int i=0;i<its;i++)result=compute(raw);
    double ms=chrono::duration<double,milli>(chrono::steady_clock::now()-start).count()/its;
    string json="{\"total\":"+summary(result.total)+",\"daily\":"+group(result.daily)+",\"monthly\":"+group(result.monthly)+",\"yearly\":"+group(result.yearly)+"}";
    cout<<setprecision(12)<<"{\"backend\":\"cpp\",\"iterations\":"<<its<<",\"ms_per_iteration\":"<<ms<<",\"result\":"<<json<<"}\n";
    return 0;
 }catch(const exception&e){cerr<<"ERROR: "<<e.what()<<'\n';return 1;}}
