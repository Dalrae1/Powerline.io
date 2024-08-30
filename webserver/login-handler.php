<?php
require __DIR__ . '/../vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->load();

// JWT Functions

function base64UrlDecode($input) {
    $remainder = strlen($input) % 4;
    if ($remainder) {
        $padlen = 4 - $remainder;
        $input .= str_repeat('=', $padlen);
    }
    $decoded = base64_decode(strtr($input, '-_', '+/'));
    if ($decoded === false) {
        throw new Exception("Base64 decoding failed for input: $input");
    }
    return $decoded;
}

function fetchGooglePublicKeys() {
    $googleKeysUrl = "https://www.googleapis.com/oauth2/v3/certs";
    $keys = json_decode(file_get_contents($googleKeysUrl), true);
    if (!$keys) {
        throw new Exception("Failed to fetch Google public keys");
    }
    return $keys['keys'];
}

function findPublicKey($keys, $kid) {
    foreach ($keys as $key) {
        if ($key['kid'] === $kid) {
            return $key;
        }
    }
    throw new Exception("Public key for kid not found");
}

function convertJwkToPem($jwk) {
    $modulus = base64UrlDecode($jwk['n']);
    $exponent = base64UrlDecode($jwk['e']);

    $modulus = "\x00" . $modulus; // Ensure the modulus is a positive integer

    $components = [
        'modulus' => $modulus,
        'publicExponent' => $exponent,
    ];

    $rsaKey = asn1encodeSequence(
        asn1encodeInteger($components['modulus']),
        asn1encodeInteger($components['publicExponent'])
    );

    $rsaPublicKey = asn1encodeSequence(
        asn1encodeSequence(
            asn1encodeObjectIdentifier("\x2a\x86\x48\x86\xf7\x0d\x01\x01\x01"), // OID for RSA encryption
            "\x05\x00" // NULL
        ),
        asn1encodeBitString($rsaKey)
    );

    $pem = "-----BEGIN PUBLIC KEY-----\n" .
           chunk_split(base64_encode($rsaPublicKey), 64, "\n") .
           "-----END PUBLIC KEY-----\n";
    return $pem;
}

function asn1encodeInteger($value) {
    $length = strlen($value);
    return "\x02" . asn1encodeLength($length) . $value;
}

function asn1encodeSequence(...$values) {
    $encoded = implode('', $values);
    $length = strlen($encoded);
    return "\x30" . asn1encodeLength($length) . $encoded;
}

function asn1encodeBitString($value) {
    $length = strlen($value);
    return "\x03" . asn1encodeLength($length + 1) . "\x00" . $value;
}

function asn1encodeObjectIdentifier($oid) {
    $length = strlen($oid);
    return "\x06" . asn1encodeLength($length) . $oid;
}

function asn1encodeLength($length) {
    if ($length < 0x80) {
        return chr($length);
    } elseif ($length <= 0xff) {
        return "\x81" . chr($length);
    } elseif ($length <= 0xffff) {
        return "\x82" . pack('n', $length);
    } else {
        throw new Exception("ASN.1 length too long to encode");
    }
}

function rsaVerify($header, $payload, $signature, $pem) {
    $publicKey = openssl_pkey_get_public($pem);
    if ($publicKey === false) {
        throw new Exception("Invalid public key");
    }
    $data = "$header.$payload";
    $signature = base64UrlDecode($signature);
    $verified = openssl_verify($data, $signature, $publicKey, OPENSSL_ALGO_SHA256);
    return $verified === 1;
}

function verifyGoogleToken($idToken, $clientId) {
    $tokenParts = explode('.', $idToken);
    if (count($tokenParts) !== 3) {
        throw new Exception("Invalid ID token format");
    }

    list($header, $payload, $signature) = $tokenParts;

    error_log("Header (base64): $header");
    error_log("Payload (base64): $payload");
    error_log("Signature (base64): $signature");

    $decodedHeader = base64UrlDecode($header);
    error_log("Decoded Header: " . bin2hex($decodedHeader));
    $jsonHeader = json_decode($decodedHeader, true);
    if (!$jsonHeader) {
        throw new Exception("Invalid ID token header: " . $decodedHeader);
    }

    $decodedPayload = base64UrlDecode($payload);
    error_log("Decoded Payload: " . bin2hex($decodedPayload));
    $jsonPayload = json_decode($decodedPayload, true);
    if (!$jsonPayload) {
        throw new Exception("Invalid ID token payload: " . $decodedPayload);
    }

    $keys = fetchGooglePublicKeys();
    $publicKey = findPublicKey($keys, $jsonHeader['kid']);

    $pem = convertJwkToPem($publicKey);

    $verified = rsaVerify($header, $payload, $signature, $pem);
    if (!$verified) {
        throw new Exception("Invalid ID token signature");
    }

    $issuers = ["https://accounts.google.com", "accounts.google.com"];
    if (!in_array($jsonPayload['iss'], $issuers)) {
        throw new Exception("Invalid ID token issuer");
    }
    if ($jsonPayload['aud'] !== $clientId) {
        throw new Exception("Invalid ID token audience");
    }
    if ($jsonPayload['exp'] < time()) {
        throw new Exception("ID token has expired");
    }
    /*if ($jsonPayload['iat'] > time()) {
        throw new Exception("ID token issued in the future");
    }*/

    return $jsonPayload;
}

// SQL Functions
//$localIP = getHostByName(getHostName());

$db_host        = $_ENV['DB_HOST'];
$db_user        = $_ENV['DB_USER'];
$db_pass        = $_ENV['DB_PASSWORD'];
$db_database    = $_ENV['DB_DATABASE'];
$db_port        = $_ENV['DB_PORT'];

function DBConnect() {
    global $db_host, $db_user, $db_pass, $db_database, $db_port;
    $mysqli = new mysqli($db_host, $db_user, $db_pass, $db_database, $db_port);
    if ($mysqli->connect_errno) {
        LogError("Failed to connect to MySQL: " . $mysqli->connect_error);
        exit();
    }
    return $mysqli;
}

function CreateUser($usernameRaw, $emailRaw, $pfp) {
    $username = trim($usernameRaw);
    $email = trim($emailRaw);

    if (empty($username) || empty($email)) {
        return "Username and email are required.";
    }

    $mysqli = DBConnect();
    $mysqli->begin_transaction();

    try {
        $stmt = $mysqli->prepare("INSERT INTO users (username, email, pfp) VALUES (?, ?, ?)");
        if (!$stmt) {
            throw new Exception("Prepare statement failed: " . $mysqli->error);
        }
        $stmt->bind_param("sss", $username, $email, $pfp);
        $stmt->execute();

        $last_userid = $stmt->insert_id;

        $mysqli->commit();
        $stmt->close();
        $mysqli->close();

        // Fetch the created user object
        return GetUserFromId($last_userid);
    } catch (mysqli_sql_exception $exception) {
        $mysqli->rollback();
        if (isset($stmt)) {
            $stmt->close();
        }
        $mysqli->close();
        LogError("Error occurred: " . $exception->getMessage());
        return "Error occurred: " . $exception->getMessage();
    }
}

function generateRandomString($length = 30) {
    $characters = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    $charactersLength = strlen($characters);
    $randomString = '';
    for ($i = 0; $i < $length; $i++) {
        $randomString .= $characters[random_int(0, $charactersLength - 1)];
    }
    return $randomString;
}

function CreateSessionForUser($user_id) {
    $mysqli = DBConnect();
    $mysqli->begin_transaction();

    try {
        do {
            // Generate a random session ID
            $session_id = generateRandomString(30);
            // Check if session ID already exists
            $stmt = $mysqli->prepare("SELECT COUNT(*) FROM sessions WHERE session = ?");
            $stmt->bind_param("s", $session_id);
            $stmt->execute();
            $stmt->bind_result($count);
            $stmt->fetch();
            $stmt->close();
        } while ($count > 0);

        // Insert new session with the unique session ID
        $stmt = $mysqli->prepare("INSERT INTO sessions (session, userid) VALUES (?, ?)");
        if (!$stmt) {
            throw new Exception("Prepare statement failed: " . $mysqli->error);
        }
        $stmt->bind_param("si", $session_id, $user_id);
        $stmt->execute();

        if ($stmt->affected_rows === 0) {
            throw new Exception("Insert into sessions failed: " . $stmt->error);
        }

        $mysqli->commit();
        $stmt->close();
        $mysqli->close();

        return $session_id;
    } catch (mysqli_sql_exception $exception) {
        $mysqli->rollback();
        if (isset($stmt)) {
            $stmt->close();
        }
        $mysqli->close();
        LogError("Error occurred: " . $exception->getMessage());
        return "Error occurred: " . $exception->getMessage();
    }
}

function GetUserFromSession($session_id) {
    $mysqli = DBConnect();
    $stmt = $mysqli->prepare("SELECT u.userid, u.username, u.email, u.pfp 
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

function GetUserFromId($user_id) {
    $mysqli = DBConnect();
    $stmt = $mysqli->prepare("SELECT userid, username, email, pfp FROM users WHERE userid = ?");
    if (!$stmt) {
        $mysqli->close();
        throw new Exception("Prepare statement failed: " . $mysqli->error);
    }
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $user = $result->fetch_assoc();
    $stmt->close();
    $mysqli->close();
    return $user;
}

function GetUserFromEmail($email) {
    $mysqli = DBConnect();
    $stmt = $mysqli->prepare("SELECT userid, username, email, pfp FROM users WHERE email = ?");
    if (!$stmt) {
        $mysqli->close();
        throw new Exception("Prepare statement failed: " . $mysqli->error);
    }
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $result = $stmt->get_result();
    $user = $result->fetch_assoc();
    $stmt->close();
    $mysqli->close();
    return $user;
}

function LogError($message) {
    $logFile = 'errors';
    $date = date('Y-m-d H:i:s');
    $fullMessage = "[$date] $message\n";
    file_put_contents($logFile, $fullMessage, FILE_APPEND);
    echo $message;
}

function HandleGoogle($input) {
    $clientId = "173521008548-st7p20himg41f1o1s2j3mgo9851qoj4j.apps.googleusercontent.com";
    if (empty($input)) {
        throw new Exception("No input provided");
    }

    parse_str($input, $params);
    if (!isset($params['credential'])) {
        throw new Exception("JWT token not found in input");
    }

    $token = $params['credential'];

    $decodedToken = verifyGoogleToken($token, $clientId);

    $user = GetUserFromEmail($decodedToken["email"]);
    if (!$user) {
        $new_user = CreateUser($decodedToken["given_name"], $decodedToken["email"], $decodedToken["picture"]);
        if (is_array($new_user)) {
            $user = $new_user;
        } else {
            LogError($new_user);
            exit();
        }
    }

    $host = $_SERVER['HTTP_HOST'];
    $protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? "https" : "http";
    echo("Redirecting to $protocol://$host");

    if (isset($_COOKIE['session_id'])) { // If user already has a session on this browser, refresh it
        $session_id = $_COOKIE['session_id'];
        $existing_user = GetUserFromSession($session_id);
        if ($existing_user && $existing_user['userid'] == $user['userid']) {
            setcookie('session_id', $session_id, time() + 60 * 60 * 24 * 60, '/', '', true, false);
            header("Location: $protocol://$host");
            exit();
        }
    }

    $session_id = CreateSessionForUser($user['userid']);
    if (strlen($session_id) == 30) {
        setcookie('session_id', $session_id, time() + 60 * 60 * 24 * 60, '/', '', true, false);
    } else {
        LogError($session_id);
        exit();
    }
    header("Location: $protocol://$host");
}

function getRequestHeaders() {
    $headers = array();
    foreach($_SERVER as $key => $value) {
        if (substr($key, 0, 5) <> 'HTTP_') {
            continue;
        }
        $header = str_replace(' ', '-', ucwords(str_replace('_', ' ', strtolower(substr($key, 5)))));
        $headers[$header] = $value;
    }
    return $headers;
}

function HandleDiscordValidation($payload) {
    $publicKey = "9d2f57194292476e8685e4dccd48bc1434494968262d605cbc82458a2572bd20";

    if (!isset($_SERVER['HTTP_X_SIGNATURE_ED25519']) || !isset($_SERVER['HTTP_X_SIGNATURE_TIMESTAMP'])) {
        return ['code' => 401, 'payload' => "Missing headers"];
    }

    $signature = $_SERVER['HTTP_X_SIGNATURE_ED25519'];
    $timestamp = $_SERVER['HTTP_X_SIGNATURE_TIMESTAMP'];

    if (!trim($signature, '0..9A..Fa..f') == '')
        return ['code' => 401, 'payload' => "Invalid signature 1"];

    $message = $timestamp . $payload;
    $binarySignature = sodium_hex2bin($signature);
    $binaryKey = sodium_hex2bin($publicKey);

    if (!sodium_crypto_sign_verify_detached($binarySignature, $message, $binaryKey)) {
        return ['code' => 401, 'payload' => "Invalid signature 2"];
    }

    $payload = json_decode($payload, true);
    switch ($payload['type']) {
        case 1:
            return ['code' => 200, 'payload' => ['type' => 1]];
        case 2:
            return ['code' => 200, 'payload' => ['type' => 2]];
        default:
            return ['code' => 400, 'payload' => "Invalid payload type"];
    }
}

$API_ENDPOINT = 'https://discord.com/api/v10';
$CLIENT_ID = $_ENV['DISCORD_CLIENT_ID'];
$CLIENT_SECRET = $_ENV['DISCORD_SECRET'];
$REDIRECT_URI = $_ENV['DISCORD_REDIRECT_URI'];

function HandleDiscord($input) {
    global $API_ENDPOINT, $CLIENT_ID, $CLIENT_SECRET, $REDIRECT_URI;
    
    function getUserToken($code) {
        global $API_ENDPOINT, $CLIENT_ID, $CLIENT_SECRET, $REDIRECT_URI;
        $url = $API_ENDPOINT . '/oauth2/token';
        $data = [
            'grant_type' => 'authorization_code', 
            'code' => $code,
            'redirect_uri' => $REDIRECT_URI,
            'client_id' => $CLIENT_ID,
            'client_secret' => $CLIENT_SECRET
        ];

        // use key 'http' even if you send the request to https://...
        $options = [
            'http' => [
                'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
                'method' => 'POST',
                'content' => http_build_query($data),
            ],
        ];

        $context = stream_context_create($options);
        $result = file_get_contents($url, false, $context);
        return $result;
    }

    function getUserInfo() {
        global $API_ENDPOINT;
        $discordCode = $_SERVER['QUERY_STRING'];
        $discordCode = explode("=", $discordCode)[1];
        $accessTokenRes = getUserToken($discordCode);

        if ($accessTokenRes) {
            $accessTokenRes = json_decode($accessTokenRes, true);
            $accessToken = $accessTokenRes['access_token'];

            $userRes = file_get_contents($API_ENDPOINT . '/users/@me', false, stream_context_create([
                'http' => [
                    'header' => "Authorization: Bearer ".$accessToken
                ]
            ]));

            if ($userRes) {
                return json_decode($userRes, true);
            }
        }
        return false;
    }

    $user = getUserInfo();
    if ($user) {
        $discordUser = GetUserFromEmail($user['email']);
        if (!$discordUser) {
            $new_user = CreateUser($user['username'], $user['email'], "https://cdn.discordapp.com/avatars/".$user['id']."/".$user['avatar'].".png");
            if (is_array($new_user)) {
                $discordUser = $new_user;
            } else {
                LogError($new_user);
                exit();
            }
        }

        $host = $_SERVER['HTTP_HOST'];
        $protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? "https" : "http";
        echo("Redirecting to $protocol://$host");

        if (isset($_COOKIE['session_id'])) { // If user already has a session on this browser, refresh it
            $session_id = $_COOKIE['session_id'];
            $existing_user = GetUserFromSession($session_id);
            if ($existing_user && $existing_user['userid'] == $discordUser['userid']) {
                setcookie('session_id', $session_id, time() + 60 * 60 * 24 * 60, '/', '', true, false);
                echo "<script>window.close();</script>";
                //header("Location: $protocol://$host");
                exit();
            }
        }

        $session_id = CreateSessionForUser($discordUser['userid']);
        if (strlen($session_id) == 30) {
            setcookie('session_id', $session_id, time() + 60 * 60 * 24 * 60, '/', '', true, false);
        } else {
            LogError($session_id);
            exit();
        }
        echo "<script>window.close();</script>";
        //header("Location: $protocol://$host");
    }
    return false;
}

try {
    $input = file_get_contents("php://input");
    parse_str($input, $tempParams);
    if (isset($tempParams['credential'])) {
        HandleGoogle($input);
        return;
    }
    if (strpos($_SERVER['QUERY_STRING'], "code") !== false) {
        HandleDiscord($input);
        return;
    }
    // For validation of Discord requests
    $result = HandleDiscordValidation($input);
    http_response_code($result['code']);
    echo json_encode($result['payload']);

    
} catch (Exception $e) {
    LogError("Error: " . $e->getMessage());
}
?>
