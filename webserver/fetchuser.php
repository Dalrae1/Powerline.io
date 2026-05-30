<?php
require __DIR__ . '/../vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->load();

//$localIP = getHostByName(getHostName());

$db_host        = $_ENV['DB_HOST'];
$db_user        = $_ENV['DB_USER'];
$db_pass        = $_ENV['DB_PASSWORD'];
$db_database    = $_ENV['DB_DATABASE'];
$db_port        = $_ENV['DB_PORT'];

// Absolute path one level above the webroot so the log is never web-accessible.
define('LOG_FILE', dirname(__DIR__) . '/logs/errors.log');

function LogError($message) {
    $logDir = dirname(LOG_FILE);
    if (!is_dir($logDir)) mkdir($logDir, 0750, true);
    $date = date('Y-m-d H:i:s');
    file_put_contents(LOG_FILE, "[$date] $message\n", FILE_APPEND);
    // Never send internal error details to the HTTP response — log only.
}
function DBConnect() {
    global $db_host, $db_user, $db_pass, $db_database, $db_port;
    $mysqli = new mysqli($db_host, $db_user, $db_pass, $db_database, $db_port);
    if ($mysqli->connect_errno) {
        LogError("Failed to connect to MySQL: " . $mysqli->connect_error);
        exit();
    }
    return $mysqli;
}

function GetUserFromSession($session_id) {
    $mysqli = DBConnect();
    // email is intentionally excluded — the client never needs it, and returning
    // it in every page-load response unnecessarily exposes PII.
    $stmt = $mysqli->prepare("SELECT u.userid, u.username, u.rank, u.pfp
                              FROM users u
                              JOIN sessions s ON u.userid = s.userid
                              WHERE s.session = ?");
    if (!$stmt) {
        $mysqli->close();
        throw new Exception("Prepare statement failed: " . $mysqli->error);
    }
    $stmt->bind_param("s", $session_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $user = $result->fetch_assoc();
    $stmt->close();
    $mysqli->close();
    return $user;
}


if (isset($_COOKIE['session_id'])) {
    $user = GetUserFromSession($_COOKIE['session_id']);
    echo(json_encode($user));
}





?>