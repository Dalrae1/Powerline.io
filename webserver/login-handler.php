<?php
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
    openssl_free_key($publicKey);
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
    if ($jsonPayload['iat'] > time()) {
        throw new Exception("ID token issued in the future");
    }

    return $jsonPayload;
}

try {
    $clientId = "173521008548-st7p20himg41f1o1s2j3mgo9851qoj4j.apps.googleusercontent.com";
    $input = file_get_contents("php://input");

    if (empty($input)) {
        throw new Exception("No input provided");
    }

    parse_str($input, $params);
    if (!isset($params['credential'])) {
        throw new Exception("JWT token not found in input");
    }

    $token = $params['credential'];

    $decodedToken = verifyGoogleToken($token, $clientId);



    $usersFile = fopen("users.json", "w");
    $users = json_decode(file_get_contents("users.json"), true);

    $users[$decodedToken['email']] = $decodedToken+"\n";
    fwrite($usersFile, json_encode($users));
    fclose($usersFile);

    header('Location: https://dalr.ae');
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
?>
