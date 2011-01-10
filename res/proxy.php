<?php
//Binary Proxy
if (isset($_GET['url'])) {
	try {
		$curl = curl_init();
		curl_setopt($curl, CURLOPT_URL, stripslashes($_GET['url']));
		curl_setopt($curl, CURLOPT_RETURNTRANSFER, 1);
		curl_setopt($curl, CURLOPT_USERAGENT, $_SERVER['HTTP_USER_AGENT']);
		curl_setopt($curl, CURLOPT_POST, false);
		curl_setopt($curl, CURLOPT_CONNECTTIMEOUT, 30);
		$result = curl_exec($curl);
		curl_close($curl);
		if ($result !== false) {
			header('Content-Type: text/plain; charset=ASCII');
			header('Expires: '.gmdate('D, d M Y H:i:s \G\M\T', time() + (3600 * 24 * 7)));
			echo(base64_encode($result));
		}
		else {
			header('HTTP/1.0 404 File Not Found');
		}
	}
	catch (Exception $error) { }
}
?>