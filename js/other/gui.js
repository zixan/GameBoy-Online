var windowingInitialized = false;
var inFullscreen = false;
function windowingPreInitUnsafe() {
	if (!windowingInitialized) {
		windowingInitialized = true;
		windowingInitialize();
	}
}
function windowingPreInitSafe() {
	if (typeof document.readyState == "undefined" || document.readyState == "complete") {
		windowingPreInitUnsafe();
	}
}
function windowingInitUnload() {
	cout("In windowingInitUnload() : Unregistering window loading events.", 0);
	removeEvent("DOMContentLoaded", document, windowingPreInitUnsafe);
	removeEvent("readystatechange", document, windowingPreInitSafe);
	removeEvent("load", document, windowingPreInitUnsafe);
}
function windowingInitialize() {
	cout("windowingInitialize() called.", 0);
	windowingInitUnload();
	windowStacks[0] = windowCreate("GameBoy", true);
	windowStacks[1] = windowCreate("terminal", false);
	windowStacks[2] = windowCreate("about", false);
	windowStacks[3] = windowCreate("settings", false);
	windowStacks[4] = windowCreate("input_select", false);
	windowStacks[5] = windowCreate("instructions", false);
	try {
		//Hook the GUI controls.
		registerGUIEvents();
		//Load any save states:
		loadSaveStates();
	}
	catch (error) {
		cout("Fatal windowing error: \"" + error.message + "\" file:" + error.fileName + " line: " + error.lineNumber, 2);
	}
	try {
		try {
			//Check for mozAudio
			var audiohook = new Audio();
			audiohook.mozSetup(2, 44100);
		}
		catch (error) {
			//Check for the proposed standard Audio API's context object.
			if (typeof AudioContext == "undefined") {
				throw(new Error(""));
			}
		}
	}
	catch (error) {
		//settings[0] = false;	//Turn off audio by default
		settings[1] = true;		//Mono on non-native to speed it up.
		//cout("Native audio sample writing support not found, audio turned off by default.", 1);
	}
	//Update the settings to the emulator's default:
	document.getElementById("enable_sound").checked = settings[0];
	document.getElementById("enable_mono_sound").checked = settings[1];
	document.getElementById("disable_colors").checked = settings[2];
	document.getElementById("bmp_method").checked = settings[5];
	document.getElementById("auto_frameskip").checked = settings[7];
	document.getElementById("rom_only_override").checked = settings[9];
	document.getElementById("mbc_enable_override").checked = settings[10];
	document.getElementById("enable_gbc_bios").checked = settings[16];
	document.getElementById("enable_colorization").checked = settings[17];
	document.getElementById("do_minimal").checked = settings[19];
	document.getElementById("software_resizing").checked = settings[21];
	document.getElementById("typed_arrays_disallow").checked = settings[22];
}
function registerGUIEvents() {
	cout("In registerGUIEvents() : Registering GUI Events.", -1);
	addEvent("click", document.getElementById("terminal_clear_button"), clear_terminal);
	addEvent("click", document.getElementById("terminal_close_button"), function () { windowStacks[1].hide() });
	addEvent("click", document.getElementById("about_close_button"), function () { windowStacks[2].hide() });
	addEvent("click", document.getElementById("settings_close_button"), function () { windowStacks[3].hide() });
	addEvent("click", document.getElementById("input_select_close_button"), function () { windowStacks[4].hide() });
	addEvent("click", document.getElementById("instructions_close_button"), function () { windowStacks[5].hide() });
	addEvent("click", document.getElementById("GameBoy_about_menu"), function () { windowStacks[2].show() });
	addEvent("click", document.getElementById("GameBoy_settings_menu"), function () { windowStacks[3].show() });
	addEvent("keydown", document, function (event) {
		if (event.keyCode == 27) {
			//Fullscreen on/off
			fullscreenPlayer();
		}
		else {
			//Control keys / other
			GameBoyKeyDown(event);
		}
	});
	addEvent("keyup", document, GameBoyKeyUp);
	//addEvent("MozOrientation", window, GameBoyJoyStickSignalHandler);
	new popupMenu(document.getElementById("GameBoy_file_menu"), document.getElementById("GameBoy_file_popup"));
	addEvent("click", document.getElementById("data_uri_clicker"), function () {
		var datauri = prompt("Please input the ROM image's Base 64 Encoded Text:", "");
		if (datauri != null && datauri.length > 0) {
			try {
				cout(Math.floor(datauri.length * 3 / 4) + " bytes of data submitted by form (text length of " + datauri.length + ").", 0);
				start(document.getElementsByTagName("canvas")[0],  document.getElementById("canvasAltContainer"), base64_decode(datauri));
				initPlayer();
			}
			catch (error) {
				alert(error.message + " file: " + error.fileName + " line: " + error.lineNumber);
			}
		}
	});
	addEvent("click", document.getElementById("external_file_clicker"), function () {
		var address = prompt("Please input the ROM image's URL:", "");
		if (address != null && address.length > 0) {
			try {
				new Ajax({
					URL:"res/proxy.php",
					GET:["url=" + escape(address)],
					Accept:"TEXT",
					Cached:true,
					Fail:function (error_message) {
						cout("Failed to load the ROM file through XmlHttpRequest.\r\nReason: " + error_message, 2);
					},
					Complete:function () {
						try {
							var romStream = base64_decode(arguments[1]);
							cout(romStream.length + " bytes of base64 decoded data retrieved by XHR (text length of " + arguments[1].length + ").", 0);
							start(document.getElementsByTagName("canvas")[0],  document.getElementById("canvasAltContainer"), romStream);
							initPlayer();
						}
						catch (error) {
							alert(error.message + " file: " + error.fileName + " line: " + error.lineNumber);
						}
					}
				});
			}
			catch (error) {
				alert(error.message + " file: " + error.fileName + " line: " + error.lineNumber);
			}
		}
	});
	addEvent("click", document.getElementById("internal_file_clicker"), function () {
		var file_opener = document.getElementById("local_file_open");
		windowStacks[4].show();
		file_opener.click();
	});
	addEvent("blur", document.getElementById("input_select"), function () {
		windowStacks[4].hide();
	});
	addEvent("change", document.getElementById("local_file_open"), function () {
		windowStacks[4].hide();
		if (typeof this.files != "undefined") {
			try {
				if (this.files.length >= 1) {
					cout("Reading the local file \"" + this.files[0].name + "\"", 0);
					try {
						//Gecko 1.9.2+ (Standard Method)
						var binaryHandle = new FileReader();
						binaryHandle.onload = function () {
							if (this.readyState == 2) {
								cout("file loaded.", 0);
								try {
									start(document.getElementsByTagName("canvas")[0], document.getElementById("canvasAltContainer"), this.result);
									initPlayer();
								}
								catch (error) {
									alert(error.message + " file: " + error.fileName + " line: " + error.lineNumber);
								}
							}
							else {
								cout("loading file, please wait...", 0);
							}
						}
						binaryHandle.readAsBinaryString(this.files[this.files.length - 1]);
					}
					catch (error) {
						cout("Browser does not support the FileReader object, falling back to the non-standard File object access,", 2);
						//Gecko 1.9.0, 1.9.1 (Non-Standard Method)
						var romImageString = this.files[this.files.length - 1].getAsBinary();
						try {
							start(document.getElementsByTagName("canvas")[0], document.getElementById("canvasAltContainer"), romImageString);
							initPlayer();
						}
						catch (error) {
							alert(error.message + " file: " + error.fileName + " line: " + error.lineNumber);
						}
						
					}
				}
				else {
					cout("Incorrect number of files selected for local loading.", 1);
				}
			}
			catch (error) {
				cout("Could not load in a locally stored ROM file.", 2);
			}
		}
		else {
			cout("could not find the handle on the file to open.", 2);
		}
	});
	addEvent("click", document.getElementById("restart_cpu_clicker"), function () {
		if (typeof gameboy == "object" && gameboy != null && typeof gameboy.ROMImage == "string") {
			try {
				if (!gameboy.fromSaveState) {
					start(document.getElementsByTagName("canvas")[0], document.getElementById("canvasAltContainer"), gameboy.ROMImage);
					initPlayer();
				}
				else {
					openState(gameboy.savedStateFileName, document.getElementsByTagName("canvas")[0],  document.getElementById("canvasAltContainer"));
					initPlayer();
				}
			}
			catch (error) {
				alert(error.message + " file: " + error.fileName + " line: " + error.lineNumber);
			}
		}
		else {
			cout("Could not restart, as a previous emulation session could not be found.", 1);
		}
	});
	addEvent("click", document.getElementById("run_cpu_clicker"), function () {
		run();
	});
	addEvent("click", document.getElementById("kill_cpu_clicker"), function () {
		pause();
	});
	addEvent("click", document.getElementById("save_state_clicker"), function () {
		save();
	});
	addEvent("click", document.getElementById("enable_sound"), function () {
		settings[0] = document.getElementById("enable_sound").checked;
		if (typeof gameboy == "object" && gameboy != null) {
			gameboy.initSound();
		}
	});
	addEvent("click", document.getElementById("enable_mono_sound"), function () {
		settings[1] = document.getElementById("enable_mono_sound").checked;
		if (typeof gameboy == "object" && gameboy != null) {
			gameboy.initSound();
		}
	});
	addEvent("click", document.getElementById("disable_colors"), function () {
		settings[2] = document.getElementById("disable_colors").checked;
	});
	addEvent("click", document.getElementById("bmp_method"), function () {
		settings[5] = document.getElementById("bmp_method").checked;
	});
	addEvent("click", document.getElementById("auto_frameskip"), function () {
		settings[7] = document.getElementById("auto_frameskip").checked;
		settings[4] = 0;	//Reset the frame skipping amount.
	});
	addEvent("click", document.getElementById("rom_only_override"), function () {
		settings[9] = document.getElementById("rom_only_override").checked;
	});
	addEvent("click", document.getElementById("mbc_enable_override"), function () {
		settings[10] = document.getElementById("mbc_enable_override").checked;
	});
	addEvent("click", document.getElementById("enable_gbc_bios"), function () {
		settings[16] = document.getElementById("enable_gbc_bios").checked;
	});
	addEvent("click", document.getElementById("enable_colorization"), function () {
		settings[17] = document.getElementById("enable_colorization").checked;
		if (typeof gameboy == "object" && gameboy != null) {
			gameboy.checkPaletteType();
		}
	});
	addEvent("click", document.getElementById("do_minimal"), function () {
		settings[19] = document.getElementById("do_minimal").checked;
		document.getElementById("fullscreen").className = (settings[19]) ? "minimum" : "maximum";
	});
	addEvent("click", document.getElementById("software_resizing"), function () {
		settings[21] = document.getElementById("software_resizing").checked;
		if (typeof gameboy == "object" && gameboy != null && !gameboy.canvasFallbackHappened) {
			initNewCanvasSize();
			gameboy.initLCD();
		}
	});
	addEvent("click", document.getElementById("typed_arrays_disallow"), function () {
		settings[22] = document.getElementById("typed_arrays_disallow").checked;
	});
	addEvent("click", document.getElementById("view_fullscreen"), fullscreenPlayer);
	new popupMenu(document.getElementById("GameBoy_view_menu"), document.getElementById("GameBoy_view_popup"));
	addEvent("click", document.getElementById("view_terminal"), function () { windowStacks[1].show() });
	addEvent("click", document.getElementById("view_instructions"), function () { windowStacks[5].show() });
	addEvent("mouseup", document.getElementById("gfx"), onResizeOutput);
	addEvent("resize", window, onResizeOutput);
}
function onResizeOutput() {
	if (typeof gameboy == "object" && gameboy != null && !gameboy.canvasFallbackHappened && settings[21]) {
		cout("Resizing canvas.", 0);
		initNewCanvasSize();
		gameboy.initLCD();
	}
}
function initNewCanvasSize() {
	if (!settings[21]) {
		gameboy.canvas.width = gameboy.width = 160;
		gameboy.canvas.height = gameboy.height = 144;
	}
	else {
		gameboy.canvas.width = gameboy.width = gameboy.canvas.clientWidth;
		gameboy.canvas.height = gameboy.height = gameboy.canvas.clientHeight;
	}
	gameboy.pixelCount = gameboy.width * gameboy.height;
	gameboy.rgbCount = gameboy.pixelCount * 4;
	gameboy.widthRatio = 160 / gameboy.width;
	gameboy.heightRatio = 144 / gameboy.height;
}
function initPlayer() {
	if (typeof gameboy == "object" && gameboy != null && !gameboy.canvasFallbackHappened) {
		initNewCanvasSize();
		if (settings[21]) {
			gameboy.initLCD();
		}
	}
	document.getElementById("title").style.display = "none";
	document.getElementById("port_title").style.display = "none";
	document.getElementById("fullscreenContainer").style.display = "none";
}
function fullscreenPlayer() {
	if (typeof gameboy == "object" && gameboy != null && !gameboy.canvasFallbackHappened) {
		if (!inFullscreen) {
			gameboy.canvas = document.getElementById("fullscreen");
			document.getElementById("fullscreen").className = (settings[19]) ? "minimum" : "maximum";
			document.getElementById("fullscreenContainer").style.display = "block";
			windowStacks[0].hide();
		}
		else {
			gameboy.canvas = document.getElementsByTagName("canvas")[0];
			document.getElementById("fullscreenContainer").style.display = "none";
			windowStacks[0].show();
		}
		initNewCanvasSize();
		gameboy.initLCD();
		inFullscreen = !inFullscreen;
	}
	else {
		cout("Cannot go into fullscreen mode.", 2);
	}
}
//Check for existing saves states on startup and add each to the menu:
function loadSaveStates() {
	try {
		if (findValue("state_names") != null) {
			var states = findValue("state_names");
			for (var index = 0; index < states.length; index++) {
				cout("Adding the save state \""+ states[index] + "\" drop down menu.", 0);
				addSaveStateItem(states[index]);
			}
			document.getElementById("open_saved_clicker").style.display = "block";
		}
	}
	catch (error) {
		cout("A problem with attempting to load save states occurred.", 2);
	}
}
//Add a save state to the menu:
function addSaveStateItem(filename) {
	var new_item = document.createElement("li");
	new_item.appendChild(document.createTextNode(filename));
	document.getElementById("save_states").appendChild(new_item);
	addEvent("click", new_item, function () {
		try {
			if (findValue("state_names") != null) {
				var states = findValue("state_names");
				cout("Attempting to find a save state record with the name: \"" + this.firstChild.data + "\"", 0);
				for (var romState in states) {
					if (states[romState] == this.firstChild.data) {
						openState(states[romState], document.getElementsByTagName("canvas")[0],  document.getElementById("canvasAltContainer"));
						initPlayer();
					}
				}
			}
			else {
				cout("The selected save state seems to be missing.", 2);
			}
		}
		catch (error) {
			cout("A problem with attempting to open the selected save state occurred.", 2);
		}
	});
}
//Wrapper for localStorage getItem, so that data can be retrieved in various types.
function findValue(key) {
	try {
		if (window.localStorage.getItem(key) != null) {
			return JSON.parse(window.localStorage.getItem(key));
		}
	}
	catch (error) {
		//An older Gecko 1.8.1/1.9.0 method of storage (Deprecated due to the obvious security hole):
		if (window.globalStorage[location.hostname].getItem(key) != null) {
			return JSON.parse(window.globalStorage[location.hostname].getItem(key));
		}
	}
	return null;
}
//Wrapper for localStorage setItem, so that data can be set in various types.
function setValue(key, value) {
	try {
		window.localStorage.setItem(key, JSON.stringify(value));
	}
	catch (error) {
		//An older Gecko 1.8.1/1.9.0 method of storage (Deprecated due to the obvious security hole):
		window.globalStorage[location.hostname].setItem(key, JSON.stringify(value));
	}
}
//Some wrappers and extensions for non-DOM3 browsers:
function isDescendantOf(ParentElement, toCheck) {
	//Verify an object as either a direct or indirect child to another object.
	function traverseTree(domElement) {
		while (domElement != null) {
			if (domElement.nodeType == 1) {
				if (isSameNode(domElement, toCheck)) {
					return true;
				}
				if (hasChildNodes(domElement)) {
					if (traverseTree(domElement.firstChild)) {
						return true;
					}
				}
			}
			domElement = domElement.nextSibling;
		}
		return false;
	}
	return traverseTree(ParentElement.firstChild);
}
function hasChildNodes(oElement) {
	return (typeof oElement.hasChildNodes == "function") ? oElement.hasChildNodes() : ((oElement.firstChild != null) ? true : false);
}
function isSameNode(oCheck1, oCheck2) {
	return (typeof oCheck1.isSameNode == "function") ? oCheck1.isSameNode(oCheck2) : (oCheck1 === oCheck2);
}
function pageXCoord(event) {
	if (typeof event.pageX == "undefined") {
		return event.clientX + document.documentElement.scrollLeft;
	}
	return event.pageX;
}
function pageYCoord(event) {
	if (typeof event.pageY == "undefined") {
		return event.clientY + document.documentElement.scrollTop;
	}
	return event.pageY;
}
function mouseLeaveVerify(oElement, event) {
	//Hook target element with onmouseout and use this function to verify onmouseleave.
	return isDescendantOf(oElement, (typeof event.target != "undefined") ? event.target : event.srcElement) && !isDescendantOf(oElement, (typeof event.relatedTarget != "undefined") ? event.relatedTarget : event.toElement);
}
function mouseEnterVerify(oElement, event) {
	//Hook target element with onmouseover and use this function to verify onmouseenter.
	return !isDescendantOf(oElement, (typeof event.target != "undefined") ? event.target : event.srcElement) && isDescendantOf(oElement, (typeof event.relatedTarget != "undefined") ? event.relatedTarget : event.fromElement);
}
function addEvent(sEvent, oElement, fListener) {
	try {	
		oElement.addEventListener(sEvent, fListener, false);
		cout("In addEvent() : Standard addEventListener() called to add a(n) \"" + sEvent + "\" event.", -1);
	}
	catch (error) {
		oElement.attachEvent("on" + sEvent, fListener);	//Pity for IE.
		cout("In addEvent() : Nonstandard attachEvent() called to add an \"on" + sEvent + "\" event.", -1);
	}
}
function removeEvent(sEvent, oElement, fListener) {
	try {	
		oElement.removeEventListener(sEvent, fListener, false);
		cout("In removeEvent() : Standard removeEventListener() called to remove a(n) \"" + sEvent + "\" event.", -1);
	}
	catch (error) {
		oElement.detachEvent("on" + sEvent, fListener);	//Pity for IE.
		cout("In removeEvent() : Nonstandard detachEvent() called to remove an \"on" + sEvent + "\" event.", -1);
	}
}