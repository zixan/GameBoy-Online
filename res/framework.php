<?php
////////////Framework (c) 2009 by Grant Galitz
////How To Use:
//1) Configure the default settings.
//2) Extend the class 'site' and lastly,
//3) create the functions body_render() start_processing() in the new class.
//start_processing() is used to process data before the body tag group.
//body_render() is used to render the contents inside the body tag group.
//Look at the class 'site' for variables to manipulate to control the header section of a document,
//as well as which class provided functions are available for use.
///Documented class 'site' variables:
//$title is a string used for the title.
//$style is a string used for inline CSS in the header.
//$link is an array containing href, type, rel, and optionally title.
//$script is a string used for inline scripting in the header.
//$script_alt is an array used for containing alternate scripting sources in the header.
//$meta is an array used for meta tags using the content attribute.
//$meta_http is an array used for meta tags using the http-equiv attribute.
////Settings:
define('TIMEZONE', 'America/New_York');
define('DEFAULT_LANG', 'en-us');
////Adv. Settings (Touch only if you know what you're doing!):
define('CHARSET', 'utf-8');
define('HTTPCACHE', 'no-cache');
////System Constants (Do not touch!):
define('XHTML', 'application/xhtml+xml');
define('HTML', 'text/html');
define('CSS', 'text/css');
define('JS', 'text/javascript');
class server_checks {
	public $server = array();			//Raw server data...
	public $url = array();				//Location data...
	public $get = array();				//GET form data...
	public $post = array();				//POST form data...
	public $xhtml = false;				//Is XHTML supported?
	public $language_stack = array();	//Languages Supported...
	private $error = array();
	function __construct($xhtml=false) {
		$this->server_variables();
		$this->clean_data();
		$this->erroring();
		$this->find_xhtml();
		if ($xhtml) {
			$this->check_xhtml_support();
		}
		$this->header_bundle();
		date_default_timezone_set(TIMEZONE);
		$this->determine_language();
	}
	private function detect($name, $place, $fail_on_error=true, $default='') {
		if (isset($_SERVER)) {
			$this->server[$place] = $this->unicode(((isset($_SERVER[$name])) ? $_SERVER[$name] : $default));
			if (!isset($_SERVER[$name]) && $fail_on_error) {
				$this->error[] = '$_SERVER[\''.$name.'\'] was not found to exist.';
			}
		}
		else {
			$this->error[] = '$_SERVER was not found to exist.';
		}
	}
	public function server_variables() {
		$this->detect('HTTPS', 'https', false, '');
		$this->detect('HTTP_ACCEPT', 'accept', false, '');
		$this->detect('HTTP_USER_AGENT', 'user_agent', false, '');
		$this->detect('PATH_INFO', 'info', false, '');
		$this->detect('HTTP_ACCEPT_LANGUAGE', 'language', false, DEFAULT_LANG);
		$this->detect('SERVER_PORT', 'port', false, 80);
		$this->detect('SERVER_NAME', 'name', true);
		$this->detect('SCRIPT_NAME', 'path', true);
		if (empty($this->error)) {
			$this->url['protocol'] = (($this->server['https']) ? 'https://' : 'http://');
			$this->url['port'] = (($this->server['port'] != 80) ? ':'.$this->server['port'] : '');
			$this->url['base'] = $this->url['protocol'].$this->server['name'].$this->url['port'];
			$this->url['directory'] = dirname($this->server['path']).((dirname($this->server['path']) == '/') ? '' : '/');
			$this->url['exact'] = $this->url['base'].$this->server['path'];
			$this->url['folder'] = $this->url['base'].$this->url['directory'];
		}
	}
	public function convert_out_of_set_chars($url) {
		if (strlen($url) >= 1) {
			$url = urlencode($url);	//To encode out-of-set chars...
			$url_decode_array = array(
				'%21'=>'!',
				'%2A'=>'*',
				'%27'=>'\'',
				'%28'=>'(',
				'%29'=>')',
				'%3B'=>';',
				'%3A'=>':',
				'%40'=>'@',
				'%26'=>'&',
				'%3D'=>'=',
				'%2B'=>'+',
				'%24'=>'$',
				'%2C'=>',',
				'%2F'=>'/',
				'%3F'=>'?',
				'%25'=>'%',
				'%23'=>'#',
				'%5B'=>'[',
				'%5D'=>']',
				'+'=>'%20'
			);
			foreach ($url_decode_array as $key=>$value) {
				$url = str_replace($key, $value, $url);	//To de-encode reserved filepath chars....
			}
		}
		return $url;
	}
	public function enforce_address($url, $raw=false) {
		header('HTTP/1.1 301 Moved Permanently');
		header('Location: '.(($raw) ? $url : $this->convert_out_of_set_chars($url)));
		die();
	}
	private function clean_individual($value) {
		return $this->unicode(((get_magic_quotes_gpc()) ? stripslashes($value) : $value));
	}
	private function clean_deep($value) {
		if (is_array($value)) {
			return $this->clean_nesting($value);
		}
		else {
			return $this->clean_individual($value);
		}
	}
	private function clean_nesting($array) {
		foreach ($array as $key=>$value) {
			if (strlen($this->clean_individual($key)) >= 1) {
				$array[$this->clean_individual($key)] = $this->clean_deep($value);
			}
		}
		return $array;
	}
	private function clean_data() {
		if (isset($_GET)) {
			if (is_array($_GET)) {
				if (count($_GET) >= 1) {
					$this->get = $this->clean_nesting($_GET);
				}
			}
		}
		if (isset($_POST)) {
			if (is_array($_POST)) {
				if (count($_POST) >= 1) {
					$this->post = $this->clean_nesting($_POST);
				}
			}
		}
	}
	public function get($key, $default='') {
		if (isset($this->get[$key])) {
			return $this->get[$key];
		}
		return $default;
	}
	public function post($key, $default='') {
		if (isset($this->post[$key])) {
			return $this->post[$key];
		}
		return $default;
	}
	public function unicode($string) {
		$string = (string)$string;
		if (strlen($string) >= 1) {
			if (mb_check_encoding($string, 'UTF-8')) {
				return $string;
			}
		}
		return '';
	}
	public function erroring() {
		if (!empty($this->error)) {
			$errors = '';
			foreach ($this->error as $error) {
				$errors .= $error.'<br />';
			}
			die('<html><body bgcolor="#000000"><center><font color="FF0000"><h1>PHP Runtime <b>ERROR</b> Debug:</h1><br><br>'.$errors.'</font></center></body></html>');
		}
	}
	private function check_xhtml_support() {
		if ($this->no_xhtml()) {
			header('Content-Type: '.HTML.'; charset=utf-8');
		}
		else {
			header('Content-Type: '.XHTML.'; charset=utf-8');
		}
	}
	private function find_xhtml() {
		$this->xhtml = (bool)(stripos($this->server['accept'], XHTML) !== false);
	}
	public function no_xhtml() {
		return !$this->xhtml;
	}
	private function header_bundle() {
		header('Content-Script-Type: text/javascript');	//For XHTML compliance
		header('Pragma: '.HTTPCACHE);
	}
	private function determine_language() {
		if (strlen($this->server['language']) >= 1) {
			$langs = explode(',', $this->server['language']);
			foreach ($langs as $lang) {
				if (strlen($lang) >= 1) {
					$language = explode(';', strtolower($lang));
					$language[0] = str_replace(' ', '', $language[0]);
					if (isset($language[1])) {
						$language[1] = (float)str_replace(array('q=', ' '), '', $language[1]);
					}
					else {
						$language[1] = 1;
					}
					if ($language[1] > 0 && $language[1] <= 1) {
						if (!isset($this->language_stack[((int)($language[1] * 10))])) {
							$this->language_stack[((int)($language[1] * 10))] = array();
						}
						$this->language_stack[((int)($language[1] * 10))][] = $language[0];
					}
				}
			}
			krsort($this->language_stack, SORT_NUMERIC);
		}
	}
}
abstract class site {
	protected $title = '';
	protected $style = '';
	protected $link = array();
	protected $script = '';
	protected $script_alt = array();
	protected $meta = array();
	protected $meta_http = array();
	protected $xml;
	protected $server;
	protected $manifest = '';
	function __construct() {
		$this->server = new server_checks(true);
		$this->xml = new XMLWriter();
		$this->xml->openMemory();
		$this->xml->startDocument('1.0', CHARSET);
		$this->xml->setIndent(false);
		$this->xml->setIndentString("\t");
		$this->do_document();
	}
	private function do_document() {
		$this->start_processing();
		$this->do_dtd();
		$this->do_html();
	}
	private function do_dtd() {
		$this->xml->startDTD('html'/*, (($this->server->xhtml) ? '-//W3C//DTD XHTML 1.1//EN' : '-//W3C//DTD HTML 4.01//EN'), (($this->server->xhtml) ? 'http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd' : 'http://www.w3.org/TR/html4/strict.dtd')*/);
		$this->xml->endDTD();
	}
	private function do_html() {
		$this->xml->startElement('html');
		if ($this->server->xhtml) {
			$this->writeAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
			$this->writeAttribute('xml:lang', 'en-US');
		}
		if (!empty($this->manifest)) {
			$this->writeAttribute('manifest', $this->manifest);
		}
		$this->do_head();
		$this->do_body();
		$this->xml->endElement();
	}
	private function do_head() {
		$this->xml->startElement('head');
		$this->do_meta();
		$this->do_link();
		$this->do_style();
		$this->do_script();
		$this->xml->writeElement('title', $this->title);
		$this->xml->endElement();
	}
	private function do_style() {
		if (!empty($this->style)) {
			$this->xml->startElement('style');
			$this->writeAttribute('type', 'text/css');
			$this->text($this->style);
			$this->xml->endElement();
		}
	}
	private function do_link() {
		if (!empty($this->link)) {
			foreach ($this->link as $href=>$details) {
				$this->xml->startElement('link');
				$this->writeAttribute('href', $this->server->convert_out_of_set_chars($href));
				$this->writeAttribute('rel', $details[0]);
				$this->writeAttribute('type', $details[1]);
				if (isset($details[2])) {
					$this->writeAttribute('title', $details[2]);
				}
				$this->xml->endElement();
			}
		}
	}
	private function do_script() {
		if (!empty($this->script)) {
			$this->xml->startElement('script');
			$this->writeAttribute('type', 'text/javascript');
			$this->text($this->script);
			$this->xml->endElement();
		}
		if (!empty($this->script_alt)) {
			foreach ($this->script_alt as $href) {
				$this->xml->startElement('script');
				$this->writeAttribute('type', 'text/javascript');
				$this->writeAttribute('src', $this->server->convert_out_of_set_chars($href));
				$this->xml->endElement();
			}
		}
	}
	private function do_meta() {
		if (!empty($this->meta)) {
			foreach ($this->meta as $name=>$content) {
				$this->xml->startElement('meta');
				$this->writeAttribute('name', $name);
				$this->writeAttribute('content', $content);
				$this->xml->endElement();
			}
		}
		if (!empty($this->meta_http)) {
			foreach ($this->meta_http as $name=>$content) {
				$this->xml->startElement('meta');
				$this->writeAttribute('http-equiv', $name);
				$this->writeAttribute('content', $content);
				$this->xml->endElement();
			}
		}
	}
	private function do_body() {
		$this->xml->startElement('body');
		$this->body_render();
		$this->xml->endElement();
	}
	protected function text($string='') {
		$this->xml->text($this->server->unicode($string));
	}
	protected function writeAttribute($attribute, $string) {
		$this->xml->writeAttribute($this->server->unicode($attribute), $this->server->unicode($string));
	}
	private function commentSafe($text) {
		return str_replace('--', '', (string)$text);
	}
	protected function Comment($text='') {
		$this->xml->startComment();
		$this->text($this->commentSafe($text));
		$this->xml->endComment();
	}
	protected function startElement($element) {
		$this->xml->startElement($element);
	}
	protected function endElement() {
		$this->xml->endElement();
	}
	protected function var_dump($var) {
		ob_start();
		var_dump($var);
		$debug = ob_get_contents();
		ob_end_clean();
		return $debug;
	}
	abstract protected function body_render();
	abstract protected function start_processing();
	function __destruct() {
		if ($this->server->xhtml) {
			echo($this->xml->outputMemory());
		}
		else {
			$doc = new DOMDocument('1.0', 'UTF-8');
			$doc->loadXML($this->xml->outputMemory());
			echo($doc->saveHTML());
		}
	}
}
class userAgentChecker {
	const MOZILLA = 'Mozilla/';
	const MSIE = 'MSIE ';
	const TASMAN = 'Mac_PowerPC';
	const WEBKIT = 'AppleWebKit/';
	const PRESTO = 'Presto/';
	const JIGSAW = 'Jigsaw/';
	const KHTML = 'KHTML/';
	const W3C = 'W3C_Validator/';
	const GECKO = 'rv:';
	const GECKO_NAME = 'Gecko/';
	const DILLO = 'Dillo/';
	const IPHONE = 'iPhone';
	private $MSIE_OLDEST;
	private $WEBKIT_OLDEST;
	private $PRESTO_OLDEST;
	private $KHTML_OLDEST;
	private $GECKO_OLDEST;
	private $banned_user_agents = array();
	private $server;
	private $browser = '';
	private $major_version = 0;
	private $full_version = '';
	private $banned = false;
	function __construct(server_checks $server, $msie=7, $webkit=312, $presto=2, $khtml=4, $gecko=1.8, $banned=array()) {
		$this->server = $server;
		$this->MSIE_OLDEST = (int)$msie;
		$this->WEBKIT_OLDEST = (int)$webkit;
		$this->PRESTO_OLDEST = (int)$presto;
		$this->GECKO_OLDEST = (float)$gecko;
		if (is_array($banned)) {
			$this->banned_user_agents = $banned;
		}
		$this->banned = $this->user_agent_check();
	}
	public function banned() {
		return (bool)$this->banned;
	}
	public function browser() {
		return (string)$this->browser;
	}
	public function major() {
		return (int)$this->major_version;
	}
	public function version() {
		return (string)$this->full_version;
	}
	public function int_version() {
		return (float)$this->full_version;
	}
	public function split_version() {
		return explode('.', (string)$this->full_version);
	}
	public function int_piece($pos=0) {
		if (is_int($pos)) {
			$splitted = $this->split_version();
			if (isset($splitted[$pos])) {
				return (int)$splitted[$pos];
			}
		}
		return 0;
	}
	private function parse_version($version_position) {
		$this->full_version = '';
		$this->major_version = 0;
		if (strlen($this->server->server['user_agent']) > $version_position) {
			for ($index = $version_position; $index < strlen($this->server->server['user_agent']); $index++) {
				switch ($this->server->server['user_agent'][$index]) {
					case ' ':
					case ';':
					case ')';
					case '*':
					case '(':
						break 2;
					default:
						$this->full_version .= $this->server->server['user_agent'][$index];
				}
			}
			if (strlen($this->full_version) >= 1) {
				$this->major_version = (int)$this->full_version[0];
			}
		}
	}
	private function user_agent_check() {
		$this->major_version = 0;
		$this->browser = 'unknown';
		if (!empty($this->banned_user_agents)) {
			foreach ($this->banned_user_agents as $ua_prefix_ban) {
				if (strpos($this->server->server['user_agent'], $ua_prefix_ban) === 0) {
					return true;
				}
			}
		}
		if (strpos($this->server->server['user_agent'], self::MOZILLA) === 0) {
			$this->browser = 'Mozilla';
			$this->parse_version(strlen(self::MOZILLA));
			if ($this->major_version < 4) {
				//Really old or BS...
				return true;
			}
			else {
				if (strpos($this->server->server['user_agent'], self::MSIE) !== false) {
					if (isset($this->server->server['user_agent'][strpos($this->server->server['user_agent'], self::MSIE) + strlen(self::MSIE)])) {
						if (strpos($this->server->server['user_agent'], self::TASMAN) !== false) {
							//IE Mac
							$this->browser = 'Tasman';
						}
						else {
							//IE Windows
							$this->browser = 'MSIE';
						}
						$this->parse_version(strpos($this->server->server['user_agent'], self::MSIE) + strlen(self::MSIE));
						if ($this->major_version < $this->MSIE_OLDEST) {
							return true;
						}
					}
				}
				else {
					//Not IE...
					if (strpos($this->server->server['user_agent'], self::GECKO) !== false) {
						if (isset($this->server->server['user_agent'][strpos($this->server->server['user_agent'], self::GECKO) + strlen(self::GECKO)]) && isset($this->server->server['user_agent'][strpos($this->server->server['user_agent'], self::GECKO_NAME) + strlen(self::GECKO_NAME)])) {
							//Generic Gecko...
							$this->browser = 'Gecko';
							$this->parse_version(strpos($this->server->server['user_agent'], self::GECKO) + strlen(self::GECKO));
							if ($this->int_version() < $this->GECKO_OLDEST) {
								return true;
							}
						}
					}
					else {
						//Not Gecko-based...
						if (strpos($this->server->server['user_agent'], self::WEBKIT) !== false) {
							if (isset($this->server->server['user_agent'][strpos($this->server->server['user_agent'], self::WEBKIT) + strlen(self::WEBKIT)])) {
								//AppleWebKit
								$this->browser = 'Webkit';
								$this->parse_version(strpos($this->server->server['user_agent'], self::WEBKIT) + strlen(self::WEBKIT));
								if (strpos($this->server->server['user_agent'], self::IPHONE) !== false) {
									$this->browser = 'iPhone';
								}
								if ($this->int_version() < $this->WEBKIT_OLDEST) {
									return true;
								}
							}
						}
						else {
							//Not AppleWebKit...
							if (strpos($this->server->server['user_agent'], self::KHTML) !== false) {
								if (isset($this->server->server['user_agent'][strpos($this->server->server['user_agent'], self::KHTML) + strlen(self::KHTML)])) {
									//KHTML
									$this->browser = 'KHTML';
									$this->parse_version(strpos($this->server->server['user_agent'], self::KHTML) + strlen(self::KHTML));
									if ($this->major_version < $this->KHTML_OLDEST) {
										return true;
									}
								}
							}
						}
					}
				}
			}
		}
		else {
			//Not 'Mozilla' based...
			if (strpos($this->server->server['user_agent'], self::PRESTO) !== false) {
				if (isset($this->server->server['user_agent'][strpos($this->server->server['user_agent'], self::PRESTO) + strlen(self::PRESTO)])) {
					//Presto-Based (Opera Core)
					$this->browser = 'Presto';
					$this->parse_version(strpos($this->server->server['user_agent'], self::PRESTO) + strlen(self::PRESTO));
					if ($this->major_version < $this->PRESTO_OLDEST) {
						return true;
					}
				}
			}
			else {
				//Not Presto based...
				if (strpos($this->server->server['user_agent'], self::JIGSAW) === 0) {
					if (isset($this->server->server['user_agent'][strlen(self::JIGSAW)])) {
						//W3C CSS Validator
						$this->browser = 'Jigsaw';
						$this->parse_version(strlen(self::JIGSAW));
					}
				}
				else {
					//Not CSS Validator
					if (strpos($this->server->server['user_agent'], self::W3C) === 0) {
						if (isset($this->server->server['user_agent'][strlen(self::W3C)])) {
							//W3C Markup Validator
							$this->browser = 'W3C';
							$this->parse_version(strlen(self::W3C));
						}
					}
					else {
						//Not W3C Validator Validator
						if (strpos($this->server->server['user_agent'], self::DILLO) === 0) {
							if (isset($this->server->server['user_agent'][strlen(self::DILLO)])) {
								//Dillo
								$this->browser = 'Dillo';
								$this->parse_version(strlen(self::DILLO));
								return true;
							}
						}
					}
				}
			}
		}
		return false;
	}
}
?>
