<?php
declare(strict_types=1);
final class Stats {
    public int $rows=0,$reconstructed=0,$minutes=0,$tempMinutes=0,$rainN=0,$windN=0,$windMinutes=0,$humidN=0,$humidMinutes=0;
    public float $tempSum=0.,$rainSum=0.,$windSin=0.,$windCos=0.,$humidSum=0.;
    public ?float $tempMin=null,$tempMax=null;
    public function add(array $p): void {
        $m=(int)$p[1];++$this->rows;if($p[8]==='R')++$this->reconstructed;$this->minutes+=$m;
        if($p[3]!=='-'){$v=(float)$p[3];$this->tempSum+=$v*$m;$this->tempMinutes+=$m;$this->tempMin=$this->tempMin===null?$v:min($this->tempMin,$v);$this->tempMax=$this->tempMax===null?$v:max($this->tempMax,$v);}
        if($p[4]!=='-'){++$this->rainN;$this->rainSum+=(float)$p[4];}
        if($p[5]!=='-' && $p[6]!=='-'){$sp=(float)$p[5];$rad=(float)$p[6]*M_PI/180.;++$this->windN;$this->windSin+=sin($rad)*$sp*$m;$this->windCos+=cos($rad)*$sp*$m;$this->windMinutes+=$m;}
        if($p[7]!=='-'){++$this->humidN;$this->humidMinutes+=$m;$this->humidSum+=(float)$p[7]*$m;}
    }
    public function clean(): array {
        $h=hypot($this->windSin,$this->windCos);
        $dir=$h>1e-9?fmod(fmod(rad2deg(atan2($this->windSin,$this->windCos)),360.)+360.,360.):null;
        return ['rows'=>$this->rows,'reconstructed'=>$this->reconstructed,'minutes'=>$this->minutes,
          'tempMinutes'=>$this->tempMinutes,'tempC'=>$this->tempMinutes?$this->tempSum/$this->tempMinutes:null,
          'tempMin'=>$this->tempMin,'tempMax'=>$this->tempMax,
          'rainN'=>$this->rainN,'rainMm'=>$this->rainN?$this->rainSum:null,
          'windN'=>$this->windN,'windVectorMs'=>$this->windMinutes?$h/$this->windMinutes:null,
          'windDir'=>$dir,'humidN'=>$this->humidN,'humidPct'=>$this->humidMinutes?$this->humidSum/$this->humidMinutes:null];
    }
}
function compute(string $raw): array {
    $daily=[];$monthly=[];$yearly=[];$total=new Stats();
    $lines=explode("\n",$raw);
    for($i=1,$n=count($lines);$i<$n;$i++){
        if($lines[$i]==='')continue;
        $p=explode("\t",rtrim($lines[$i],"\r"));if(count($p)!==9)throw new RuntimeException('Bad row '.$i);
        $day=$p[2];$mon=substr($day,0,7);$year=substr($day,0,4);
        $daily[$day]??=new Stats();$daily[$day]->add($p);
        $monthly[$mon]??=new Stats();$monthly[$mon]->add($p);
        $yearly[$year]??=new Stats();$yearly[$year]->add($p);
        $total->add($p);
    }
    $asJson=function(array &$tab): array {ksort($tab,SORT_STRING);return array_map(fn(Stats $s)=>$s->clean(),$tab);};
    return ['total'=>$total->clean(),'daily'=>$asJson($daily),'monthly'=>$asJson($monthly),'yearly'=>$asJson($yearly)];
}
$raw=file_get_contents($argv[1]);if($raw===false)throw new RuntimeException('Input error');$iterations=(int)$argv[2];
$start=hrtime(true);for($i=0;$i<$iterations;$i++)$result=compute($raw);
$ms=(hrtime(true)-$start)/1e6/$iterations;
echo json_encode(['backend'=>'php','iterations'=>$iterations,'ms_per_iteration'=>$ms,'result'=>$result],JSON_THROW_ON_ERROR|JSON_PRESERVE_ZERO_FRACTION),"\n";
