<?php
$json = file_get_contents("php://input");
$a = json_decode($json);
$token = $json;
$jwt = base64_decode(str_replace('_', '/', str_replace('-','+',explode('.', $token)[1])));
$user_info = json_decode($jwt, true);


$usersFile = fopen("users.json", "w");
$users = json_decode(file_get_contents("users.json"), true);
$users[$user_info['email']] = $user_info;
fwrite($usersFile, json_encode($users));
fclose($usersFile);
?>