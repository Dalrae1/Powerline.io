<?php
$json = file_get_contents('php://input');
$myfile = fopen("testfile.txt", "w") 
fwrite($myfile, $json);
fclose($myfile);
// decode the json data
$data = json_decode($json);


?>