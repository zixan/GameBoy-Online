<?php
require_once('../res/framework.php');
header('Content-Type: '.CSS.'; charset='.CHARSET);
$server = new server_checks(false);
$UA = new userAgentChecker($server);
$Adjacent_OP = ' >';
if ($UA->browser() == 'MSIE' && $UA->int_version() < 7) {
	$Adjacent_OP = '';
}
?>@charset "utf-8";
html {
	background-color: rgb(200, 225, 225);
	background-attachment: fixed;
	background-repeat: none;
	background-image: url("../images/gradient_01.svg.php");
	background-image: linear-gradient(315deg, rgb(200, 200, 255), rgb(200, 255, 200));
	background-image: -moz-linear-gradient(315deg, rgb(200, 200, 255), rgb(200, 255, 200));
	background-image: -webkit-gradient(linear, left top, right bottom, color-stop(0, #C8C8FF), color-stop(1, #C8FFC8));
<?php
	if ($UA->browser() == 'MSIE' && $UA->int_version() < 9) {
		if ($UA->int_version() < 8) {
?>	filter: progid:DXImageTransform.Microsoft.Gradient(StartColorStr='#FFC8C8FF', EndColorStr='#FFC8FFC8', GradientType='0'), progid:DXImageTransform.Microsoft.Gradient(StartColorStr='#80C8C8FF', EndColorStr='#80C8FFC8', GradientType='1');
<?php
		}
		else {
?>	-ms-filter: "progid:DXImageTransform.Microsoft.Gradient(StartColorStr='#FFC8C8FF', EndColorStr='#FFC8FFC8', GradientType='0'), progid:DXImageTransform.Microsoft.Gradient(StartColorStr='#80C8C8FF', EndColorStr='#80C8FFC8', GradientType='1')";
<?php
		}
	}
?>
	margin: 0px;
	padding: 0px;
	font-family: arial;
	margin: 0px;
	padding: 0px;
	overflow: auto;
	text-align: left;
	direction: ltr;
	width: 100%;
	height: 100%;
	text-rendering: optimizeSpeed;
}
body {
	width: auto;
	height: auto;
	min-width: 100%;
	min-height: 100%;
	border: none;
	margin: 0px;
	padding: 0px;
}
div.menubar, div#GameBoy<?php echo($Adjacent_OP); ?> div#gfx, div.window<?php echo($Adjacent_OP); ?> div.button_rack, ul.menu {
	-webkit-text-size-adjust: none;
	-webkit-tap-highlight-color: transparent;
	-webkit-touch-callout: none;
	-webkit-user-select: none;
	-moz-user-select: none;
	-khtml-user-select: none;
	user-select: none;
}
div.window {
	visibility: visible;
	display: none;
	position: absolute;
	overflow: hidden;
	margin: 0px;
	padding: 10px 0px 0px 0px;
	top: 0px;
	left: 0px;
	color: rgb(0, 0, 0);
	font-size: 16px;
	<?php echo(($server->get('rounded') != 'true') ? '/*' : ''); ?>border-radius: 3px;
	-moz-border-radius: 3px;
	-webkit-border-radius: 3px;<?php echo(($server->get('rounded') != 'true') ? '*/' : ''); ?>

	box-shadow: 5px 5px 10px rgb(30, 30, 30);
	-moz-box-shadow: 5px 5px 10px rgb(30, 30, 30);
	-webkit-box-shadow: 5px 5px 10px rgb(30, 30, 30);
<?php
	if ($UA->browser() == 'MSIE' && $UA->int_version() < 9) {
		if ($UA->int_version() < 8) {
?>	filter: progid:DXImageTransform.Microsoft.Shadow(Color='#1E1E1E', strength='7', direction='135');
<?php
		}
		else {
?>	-ms-filter: "progid:DXImageTransform.Microsoft.Shadow(Color='#1E1E1E', strength='7', direction='135')";
<?php
		}
	}
?>
	<? echo(($server->get('rounded') != 'true') ? '/*' : ''); ?>border-top-left-radius: 10px;
	border-top-right-radius: 10px;
	-webkit-border-top-left-radius: 10px;
	-webkit-border-top-right-radius: 10px;
	-moz-border-radius-topleft: 10px;
	-moz-border-radius-topright: 10px;<?php echo(($server->get('rounded') != 'true') ? '*/' : ''); ?>

	background-color: rgb(200, 200, 200);
	z-index: 2;
	opacity: 1;
}
div#GameBoy {
	min-height: 340px;
	min-width: 400px;
}
div#input_select {
	min-height: 100px;
	min-width: 200px;
}
div#instructions {
	min-height: 300px;
	min-width: 400px;
}
div.menubar {
	max-height: 28px;
	min-width: 250px;	/*Fail safe for shitty browsers.*/
	display: block;
	overflow: hidden;
	position: absolute;
	left: 0px;
	right: 0px;
	border-top-style: solid;
	border-top-width: 1px;
	border-top-color: rgb(150, 150, 150);
	border-left-style: none;
	border-right-style: none;
	border-bottom-style: solid;
	border-bottom-width: 1px;
	border-bottom-color: rgb(50, 50, 50);
	text-overflow: ellipsis;
	margin: 0px;
	padding: 0px 0px 0px 3px;
	text-align: left;
	background-color: rgb(210, 210, 210);
	background-repeat: repeat-x;
	background-attachment: scroll;
	background-image: url("../images/gradient_02.svg.php");
	background-image: linear-gradient(top, rgb(150, 150, 150), rgb(220, 220, 220), rgb(180, 180, 180));
	background-image: -moz-linear-gradient(top, rgb(150, 150, 150), rgb(220, 220, 220), rgb(180, 180, 180));
	background-image: -webkit-gradient(linear, left top, left bottom, color-stop(0, #969696), color-stop(0.5, #DCDCDC), color-stop(1, #B4B4B4));
<?php
	if ($UA->browser() == 'MSIE' && $UA->int_version() < 9) {
		if ($UA->int_version() < 8) {
?>	filter: progid:DXImageTransform.Microsoft.Gradient(StartColorStr='#FF969696', EndColorStr='#FFB4B4B4', GradientType='0');
<?php
		}
		else {
?>	-ms-filter: "progid:DXImageTransform.Microsoft.Gradient(StartColorStr='#FF969696', EndColorStr='#FFB4B4B4', GradientType='0')";
<?php
		}
	}
?>}
div.menubar<?php echo($Adjacent_OP); ?> span {
	cursor: pointer;
	border-radius: 5px;
	-moz-border-radius: 5px;
	-webkit-border-radius: 5px;
	background-color: transparent;
	padding: 2px 5px;
	margin: 3px 3px 3px 0px;
	display: inline;
	display: inline-block;
}
div.menubar<?php echo($Adjacent_OP); ?> span:hover {
	box-shadow: 2px 2px 1px rgb(30, 30, 30);
	-moz-box-shadow: 2px 2px 1px rgb(30, 30, 30);
	-webkit-box-shadow: 2px 2px 1px rgb(30, 30, 30);
<?php
	if ($UA->browser() == 'MSIE' && $UA->int_version() < 9) {
		if ($UA->int_version() < 8) {
?>	filter: progid:DXImageTransform.Microsoft.Shadow(Color='#1E1E1E', strength='3', direction='135');
<?php
		}
		else {
?>	-ms-filter: "progid:DXImageTransform.Microsoft.Shadow(Color='#1E1E1E', strength='3', direction='135')";
<?php
		}
	}
?>
	background-color: rgb(160, 160, 160);
	background-repeat: repeat-x;
	background-attachment: scroll;
	background-image: url("../images/gradient_03.svg.php");
	background-image: linear-gradient(top, rgb(160, 160, 160), rgb(190, 190, 190), rgb(160, 160, 160));
	background-image: -moz-linear-gradient(top, rgb(160, 160, 160), rgb(190, 190, 190), rgb(160, 160, 160));
	background-image: -webkit-gradient(linear, left top, left bottom, color-stop(0, #A0A0A0), color-stop(0.5, #BEBEBE), color-stop(1, #A0A0A0));
}
div.menubar<?php echo($Adjacent_OP); ?> span:active {
	box-shadow: inset 2px 2px 1px rgb(30, 30, 30);
	-moz-box-shadow: inset 2px 2px 1px rgb(30, 30, 30);
	-webkit-box-shadow: inset 2px 2px 1px rgb(30, 30, 30);
	background-color: rgb(220, 220, 220);
	background-repeat: repeat-x;
	background-attachment: scroll;
	background-image: url("../images/gradient_04.svg.php");
	background-image: linear-gradient(top, rgb(190, 190, 190), rgb(160, 160, 160), rgb(190, 190, 190));
	background-image: -moz-linear-gradient(top, rgb(190, 190, 190), rgb(160, 160, 160), rgb(190, 190, 190));
	background-image: -webkit-gradient(linear, left top, left bottom, color-stop(0, #BEBEBE), color-stop(0.5, #A0A0A0), color-stop(1, #BEBEBE));
}
div#gfx {
	height: auto;
	width: auto;
	margin: 0px;
	padding: 0px;
	position: absolute;
	bottom: 3px;
	left: 3px;
	right: 3px;
	top: 43px;
	background-color: rgb(200, 50, 50);
	background-repeat: repeat-x;
	background-attachment: scroll;
	background-image: url("../images/gradient_05.svg.php");
	background-image: linear-gradient(top, rgb(200, 50, 50), rgb(200, 75, 150));
	background-image: -moz-linear-gradient(top, rgb(200, 50, 50), rgb(200, 75, 150));
	background-image: -webkit-gradient(linear, left top, left bottom, color-stop(0, #C83232), color-stop(1, #C84B96));
<?php
	if ($UA->browser() == 'MSIE' && $UA->int_version() < 9) {
		if ($UA->int_version() < 8) {
?>	filter: progid:DXImageTransform.Microsoft.Gradient(StartColorStr='#FFC83232', EndColorStr='#FFC84B96', GradientType='0');
<?php
		}
		else {
?>	-ms-filter: "progid:DXImageTransform.Microsoft.Gradient(StartColorStr='#FFC83232', EndColorStr='#FFC84B96', GradientType='0')";
<?php
		}
	}
?>}
body<?php echo($Adjacent_OP); ?> div#fullscreenContainer {
	position: absolute;	/*Fallback here if fixed isn't supported*/
	position: fixed;
	height: 100%;
	width: 100%;
	left: 0px;
	right: 0px;
	top: 0px;
	bottom: 0px;
	background-color: rgb(0, 0, 0);
	display: none;
	z-index: 100;
}
body<?php echo($Adjacent_OP); ?> div#fullscreenContainer<?php echo($Adjacent_OP); ?> canvas#fullscreen.maximum {
	position: static;
	height: 100%;
	width: 100%;
	margin: 0px;
	padding: 0px;
}
body<?php echo($Adjacent_OP); ?> div#fullscreenContainer<?php echo($Adjacent_OP); ?> canvas#fullscreen.minimum {
	position: absolute;
	height: 144px;
	width: 160px;
	top: 50%;
	left: 50%;
	margin: -72px 0px 0px -80px;
	padding: 0px;
}
div#GameBoy<?php echo($Adjacent_OP); ?> div#gfx<?php echo($Adjacent_OP); ?> canvas, body<?php echo($Adjacent_OP); ?> div#fullscreenContainer<?php echo($Adjacent_OP); ?> canvas#fullscreen, div#GameBoy<?php echo($Adjacent_OP); ?> div#gfx<?php echo($Adjacent_OP); ?> div#canvasAltContainer<?php echo($Adjacent_OP); ?> img {
	image-rendering: optimizeSpeed;			/*Give priority to the nearest-neighbor algorithm when rendering*/
	image-rendering: -moz-crisp-edges;		/*Forces firefox to stay in nearest-neighbor mode, which is what we want.*/
	image-rendering: -webkit-crisp-edges;	/*Here for when WebKit supports this.*/
	-ms-interpolation-mode: nearest-neighbor;
	shape-rendering: geometricPrecision;	/*We don't want the background leaking through*/
}
div#GameBoy<?php echo($Adjacent_OP); ?> div#gfx<?php echo($Adjacent_OP); ?> div#canvasAltContainer {
<?php
	if ($UA->browser() == 'MSIE' && $UA->int_version() < 9) {
		if ($UA->int_version() < 8) {
?>	filter: alpha(opacity=100);
<?php
		}
		else {
?>	-ms-filter: "alpha(opacity=100)";
<?php
		}
	}
?>
}
div#GameBoy<?php echo($Adjacent_OP); ?> div#gfx<?php echo($Adjacent_OP); ?> canvas, div#GameBoy<?php echo($Adjacent_OP); ?> div#gfx<?php echo($Adjacent_OP); ?> div#canvasAltContainer {
	position: absolute;
	z-index: 5;
	visibility: hidden;
	top: 0px;
	left: 0px;
	right: 0px;
	bottom: 0px;
	width: 100%;
	height: 100%;
	background-color: rgb(255, 255, 255);
}
div#GameBoy<?php echo($Adjacent_OP); ?> div#gfx<?php echo($Adjacent_OP); ?> div#canvasAltContainer<?php echo($Adjacent_OP); ?> img {
	display: block;
	display: inline-block;
	float: left;	/*Float and don't absolutely position, due to width & height rounding by many browsers*/
}
div#GameBoy<?php echo($Adjacent_OP); ?> div#gfx<?php echo($Adjacent_OP); ?> span#title {
	position: absolute;
	top: 30%;
	left: 15%;
	font-size: 64px;
	color: rgb(220, 220, 150);
	text-shadow: 3px 3px 5px rgb(50, 50, 50);
<?php
	if ($UA->browser() == 'MSIE' && $UA->int_version() < 9) {
		if ($UA->int_version() < 8) {
?>	filter: progid:DXImageTransform.Microsoft.Shadow(Color='#323232', strength='4', direction='135');
<?php
		}
		else {
?>	-ms-filter: "progid:DXImageTransform.Microsoft.Shadow(Color='#323232', strength='4', direction='135')";
<?php
		}
	}
?>
	font-style: italic;
	z-index: 1;
	padding: 0px 5px 0px 0px;
}
div#GameBoy<?php echo($Adjacent_OP); ?> div#gfx<?php echo($Adjacent_OP); ?> span#port_title {
	position: absolute;
	top: 45%;
	left: 55%;
	font-size: 32px;
	color: rgb(180, 70, 70);
	text-shadow: 2px 2px 4px rgb(80, 80, 80);
<?php
	if ($UA->browser() == 'MSIE' && $UA->int_version() < 9) {
		if ($UA->int_version() < 8) {
?>	filter: progid:DXImageTransform.Microsoft.Shadow(Color='#505050', strength='3', direction='135');
<?php
		}
		else {
?>	-ms-filter: "progid:DXImageTransform.Microsoft.Shadow(Color='#505050', strength='3', direction='135')";
<?php
		}
	}
?>
	font-style: italic;
	font-weight: bold;
	z-index: 2;
	padding: 0px 5px 0px 0px;
}
div#about {
	max-width: 400px;
	max-height: 300px;
	min-width: 400px;
	min-height: 300px;
}
div#terminal {
	min-height: 100px;
	min-width: 310px;
}
div#terminal, div#about, div#settings {
	height: 350px;
	width: 400px;
}
div#terminal<?php echo($Adjacent_OP); ?> div#terminal_output {
	background-color: rgb(0, 0, 0);
	margin: 0px;
	padding: 0px;
	font-family: monotype;
	font-size: 12px;
	bottom: 50px;
	padding: 10px;
	top: 10px;
	right: 3px;
	left: 3px;
	position: absolute;
	cursor: crosshair;
	overflow: auto;
	text-align: left;
}
div#terminal<?php echo($Adjacent_OP); ?> div#terminal_output<?php echo($Adjacent_OP); ?> span.white {
	color: rgb(255, 255, 255);
}
div#terminal<?php echo($Adjacent_OP); ?> div#terminal_output<?php echo($Adjacent_OP); ?> span.white:before {
	content: "<DEBUG> ";
	font-weight: bold;
}
div#terminal<?php echo($Adjacent_OP); ?> div#terminal_output<?php echo($Adjacent_OP); ?> span.yellow {
	color: rgb(255, 255, 0);
}
div#terminal<?php echo($Adjacent_OP); ?> div#terminal_output<?php echo($Adjacent_OP); ?> span.yellow:before {
	content: "<WARNING> ";
	font-weight: bold;
}
div#terminal<?php echo($Adjacent_OP); ?> div#terminal_output<?php echo($Adjacent_OP); ?> span.red {
	color: rgb(0, 0, 255);
}
div#terminal<?php echo($Adjacent_OP); ?> div#terminal_output<?php echo($Adjacent_OP); ?> span.red:before {
	content: "<ERROR> ";
	font-weight: bold;
}
div#about<?php echo($Adjacent_OP); ?> div#about_message, div#instructions<?php echo($Adjacent_OP); ?> div#keycodes {
	position: absolute;
	top: 10px;
	left: 3px;
	bottom: 50px;
	right: 3px;
	background-color: rgb(230, 230, 230);
	border-width: 5px;
	border-style: groove;
	border-color: rgb(50, 50, 50);
	padding: 5px;
	overflow: auto;
}
div#about<?php echo($Adjacent_OP); ?> div#about_message<?php echo($Adjacent_OP); ?> h1 {
	font-size: 20px;
	color: rgb(80, 60, 20);
}
div#settings<?php echo($Adjacent_OP); ?> div#toggle_settings {
	position: absolute;
	top: 10px;
	left: 3px;
	right: 3px;
	bottom: 50px;
}
div#settings<?php echo($Adjacent_OP); ?> div#toggle_settings<?php echo($Adjacent_OP); ?> div.setting {
	text-align: left;
	width: 100%;
	position: relative;
	margin: 0px;
	padding: 0px 0px 3px 0px;
	border: none;
}
div#settings<?php echo($Adjacent_OP); ?> div#toggle_settings<?php echo($Adjacent_OP); ?> div.setting:hover {
	border-bottom-style: dashed;
	border-bottom-color: rgb(70, 70, 70);
	border-bottom-width: 1px;
}
div#settings<?php echo($Adjacent_OP); ?> div#toggle_settings<?php echo($Adjacent_OP); ?> div.setting input {
	float: right;
}
div.window<?php echo($Adjacent_OP); ?> div.button_rack {
	background-color: transparent;
	margin: 0px;
	padding: 0px;
	position: absolute;
	height: 44px;
	bottom: 3px;
	right: 3px;
	left: 3px;
	text-align: center;
}
div.window<?php echo($Adjacent_OP); ?> div.button_rack<?php echo($Adjacent_OP); ?> button {
	cursor: pointer;
	padding: 0px;
	margin: 0px;
	height: 44px;
	width: 150px;
	text-align: center;
	font-size: 14px;
	position: relative;
}
div.window<?php echo($Adjacent_OP); ?> div.button_rack<?php echo($Adjacent_OP); ?> button.left {
	float: left;
}
div.window<?php echo($Adjacent_OP); ?> div.button_rack<?php echo($Adjacent_OP); ?> button.right {
	float: right;
}
div.window<?php echo($Adjacent_OP); ?> div.button_rack<?php echo($Adjacent_OP); ?> button.center {
	width: 100%;
}
ul.menu {
	list-style-position: inside;
	position: absolute;
	display: none;
	list-style-type: none;
	width: auto;
	height: auto;
	margin: 0px;
	padding: 0px;
	top: 0px;
	left: 0px;
	z-index: 3;
	background-color: rgb(200, 200, 200);
	background-repeat: repeat-x;
	background-attachment: scroll;
	background-image: url("../images/gradient_06.svg.php");
	background-image: linear-gradient(left, rgb(200, 200, 200), rgb(240, 240, 240));
	background-image: -moz-linear-gradient(left, rgb(200, 200, 200), rgb(240, 240, 240));
	background-image: -webkit-gradient(linear, top left, top right, color-stop(0, #C8C8C8), color-stop(1, #DCDCDC));
	border-radius: 3px;
	-moz-border-radius: 3px;
	-webkit-border-radius: 3px;
	box-shadow: 5px 5px 10px rgb(30, 30, 30);
	-moz-box-shadow: 5px 5px 10px rgb(30, 30, 30);
	-webkit-box-shadow: 5px 5px 10px rgb(30, 30, 30);
	border-style: solid;
	border-top-width: 1px;
	border-left-width: 1px;
	border-right-width: 2px;
	border-bottom-width: 2px;
	border-top-color: rgb(100, 100, 100);
	border-left-color: rgb(100, 100, 100);
	border-bottom-color: rgb(50, 50, 50);
	border-right-color: rgb(50, 50, 50);
	overflow: visible;
}
ul.menu:hover {
	display: block;
	display: inline-block;
	top: 0px;
	left: 0px;
}
ul.menu<?php echo($Adjacent_OP); ?> li {
	display: block;
	position: relative;
	margin: 0px;
	padding: 2px 5px 2px 15px;
	color: rgb(0, 0, 0);
	background-color: transparent;
	width: 200px;
	height: auto;
	border: none;
	overflow: visible;
	text-overflow: ellipsis;
}
ul.menu<?php echo($Adjacent_OP); ?> li:hover {
	background-color: transparent;
	background-color: rgb(255, 255, 200);
	background-color: rgba(255, 255, 200, 0.3);
}
ul.menu<?php echo($Adjacent_OP); ?> li:hover<?php echo($Adjacent_OP); ?> ul.menu {
	left: 220px;
	top: 0px;
	display: block;
	display: inline-block;
}
li#open_saved_clicker {
	display: none;
}