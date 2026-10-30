<?php
declare(strict_types=1);

// Local PHP CLI-server benchmark only. No SQL writes, no public bind.
header('Content-Type: application/json; charset=utf-8');
function required(string $key): string {
    $v = getenv($key);
    if ($v === false || $v === '') throw new RuntimeException("Missing $key");
    return $v;
}
function numeric(string $key): int {
    $v = required($key);
    if (!preg_match('/^-?[0-9]+$/D', $v)) throw new RuntimeException("Invalid $key");
    return (int)$v;
}
function db(): PDO {
    $host = required('BENCH_DB_HOST');
    $port = numeric('BENCH_DB_PORT');
    $schema = required('BENCH_DB_NAME');
    $pdo = new PDO(
        'mysql:host=' . $host . ';port=' . $port . ';dbname=' . $schema . ';charset=utf8mb4',
        required('BENCH_DB_USER'), required('BENCH_DB_PASSWORD'),
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
         PDO::ATTR_EMULATE_PREPARES => false,
         PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
         PDO::ATTR_PERSISTENT => false,
         PDO::ATTR_TIMEOUT => 5]
    );
    return $pdo;
}
function rows(PDO $pdo, string $sql, array $params = []): array {
    $q = $pdo->prepare($sql);
    $q->execute($params);
    return $q->fetchAll();
}
function point(array $row): array {
    return [
        'dateTime' => (int)$row['dateTime'],
        'outTemp' => $row['outTemp'] === null ? null : (float)$row['outTemp'],
        'rain' => $row['rain'] === null ? null : (float)$row['rain'],
    ];
}
try {
    $pdo = db();
    $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    $end = numeric('BENCH_END_TS');
    $output = null;
    switch ($path) {
        case '/current':
            $items = rows($pdo, 'SELECT dateTime,outTemp,rain FROM archive WHERE dateTime <= ? ORDER BY dateTime DESC LIMIT 1', [$end]);
            if (!$items) { http_response_code(404); echo '{"error":"no data"}'; return; }
            $output = point($items[0]);
            break;
        case '/history/24h':
        case '/history/30d':
            $days = $path === '/history/24h' ? 1 : 30;
            $items = rows($pdo, 'SELECT dateTime,outTemp,rain FROM archive WHERE dateTime > ? AND dateTime <= ? ORDER BY dateTime', [$end-$days*86400, $end]);
            $data = array_map('point', $items);
            $output = ['data' => $data, 'count' => count($data)];
            break;
        case '/statistics/yearly':
            $items = rows($pdo, 'SELECT CAST(COUNT(*) AS SIGNED) AS days, ROUND(SUM(t.wsum)/NULLIF(SUM(t.sumtime),0),3) AS meanTemp, ROUND(SUM(r.sum)*10,3) AS rainSum FROM archive_day_outTemp t JOIN archive_day_rain r USING(dateTime) WHERE t.dateTime>=? AND t.dateTime<?', [numeric('BENCH_YEAR_START'), numeric('BENCH_YEAR_END')]);
            $row = $items[0];
            $output = [
                'days' => (int)$row['days'],
                'meanTemp' => $row['meanTemp'] === null ? null : (float)$row['meanTemp'],
                'rainSum' => $row['rainSum'] === null ? null : (float)$row['rainSum'],
            ];
            break;
        default:
            http_response_code(404); echo '{"error":"unknown endpoint"}'; return;
    }
    echo json_encode($output, JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION | JSON_INVALID_UTF8_SUBSTITUTE);
} catch (Throwable $error) {
    error_log('PHP database/API failed: ' . $error->getMessage());
    http_response_code(503);
    echo '{"error":"database query failed"}';
}
