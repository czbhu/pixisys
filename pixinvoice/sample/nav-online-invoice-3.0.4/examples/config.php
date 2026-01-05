<?php

header("Content-Type: text/html; charset=utf-8");

define("TEST_DATA_DIR", __DIR__ . "/../tests/testdata/");

include("../autoload.php");

// NOTE: below PHP 7.1.0 download and include one of the SHA3 library:
// include_once(__DIR__ . "/../sha3-lib/bbSha3.php");
// include_once(__DIR__ . "/../sha3-lib/desktopdSHA3.php");

$apiUrl = NavOnlineInvoice\Config::TEST_URL; // https://api-test.onlineszamla.nav.gov.hu/invoiceService/v3

$userData = array(
    "login" => "ogim6013j4gtmnj",
    "password" => "PontosP_2025",
    // "passwordHash" => "...", // Opcionálisan, jelszó helyett a jelszó hash is átadható
    "taxNumber" => "25048740",
    "signKey" => "76-b3f7-ac222770f4aa53VYYNQVLPIN",
    "exchangeKey" => "54ef53VYYNQVKHDH",
);

$softwareData = array(
    "softwareId" => "123456789123456789",
    "softwareName" => "string",
    "softwareOperation" => "ONLINE_SERVICE",
    "softwareMainVersion" => "string",
    "softwareDevName" => "string",
    "softwareDevContact" => "string",
    "softwareDevCountryCode" => "HU",
    "softwareDevTaxNumber" => "string",
);
