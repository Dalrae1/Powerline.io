<?php
// Logout endpoint. The session_id cookie is Secure + HttpOnly, so it is
// invisible to JavaScript and can ONLY be cleared by the server. This deletes
// the session row (so the token can't be reused) and expires the cookie using
// the exact attributes it was created with, then the client reloads.
require __DIR__ . '/../vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->load();

$db_host     = $_ENV['DB_HOST'];
$db_user     = $_ENV['DB_USER'];
$db_pass     = $_ENV['DB_PASSWORD'];
$db_database = $_ENV['DB_DATABASE'];
$db_port     = $_ENV['DB_PORT'];

// Absolute path one level above the webroot so the log is never web-accessible.
define('LOG_FILE', dirname(__DIR__) . '/logs/errors.log');

function LogError($message) {
    $logDir = dirname(LOG_FILE);
    if (!is_dir($logDir)) mkdir($logDir, 0750, true);
    $date = date('Y-m-d H:i:s');
    file_put_contents(LOG_FILE, "[$date] $message\n", FILE_APPEND);
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

header('Content-Type: application/json');

// Invalidate the session server-side so a leaked token can't be reused.
if (isset($_COOKIE['session_id'])) {
    $session_id = $_COOKIE['session_id'];
    try {
        $mysqli = DBConnect();
        $stmt = $mysqli->prepare("DELETE FROM sessions WHERE session = ?");
        if ($stmt) {
            $stmt->bind_param("s", $session_id);
            $stmt->execute();
            $stmt->close();
        }
        $mysqli->close();
    } catch (Exception $e) {
        LogError("Logout DB error: " . $e->getMessage());
    }
}

// Expire the cookie with the SAME attributes used when it was set in
// login-handler.php — setcookie(..., '/', '', true, true): path '/', host-only
// domain, Secure, HttpOnly. Browsers only drop a cookie when these match.
setcookie('session_id', '', time() - 3600, '/', '', true, true);
unset($_COOKIE['session_id']);

echo json_encode(['success' => true]);
?>
