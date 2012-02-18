var windowingInitialized = false;
var inFullscreen = false;
var mainCanvas = null;
var fullscreenCanvas = null;
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
	windowStacks[6] = windowCreate("local_storage_popup", false);
	windowStacks[7] = windowCreate("local_storage_listing", false);
	mainCanvas = document.getElementById("mainCanvas");
	fullscreenCanvas = document.getElementById("fullscreen");
	try {
		//Hook the GUI controls.
		registerGUIEvents();
		//Load any save states:
		loadSaveStates();
	}
	catch (error) {
		cout("Fatal windowing error: \"" + error.message + "\" file:" + error.fileName + " line: " + error.lineNumber, 2);
	}
	//Update the settings to the emulator's default:
	document.getElementById("enable_sound").checked = settings[0];
	document.getElementById("enable_mono_sound").checked = settings[1];
	document.getElementById("disable_colors").checked = settings[2];
	document.getElementById("auto_frameskip").checked = settings[7];
	document.getElementById("rom_only_override").checked = settings[9];
	document.getElementById("mbc_enable_override").checked = settings[10];
	document.getElementById("enable_gbc_bios").checked = settings[16];
	document.getElementById("enable_colorization").checked = settings[17];
	document.getElementById("do_minimal").checked = settings[19];
	document.getElementById("software_resizing").checked = settings[18];
	document.getElementById("typed_arrays_disallow").checked = settings[5];
	document.getElementById("gb_boot_rom_utilized").checked = settings[20];
}
function registerGUIEvents() {
	cout("In registerGUIEvents() : Registering GUI Events.", -1);
	addEvent("click", document.getElementById("terminal_clear_button"), clear_terminal);
	addEvent("click", document.getElementById("local_storage_list_refresh_button"), refreshStorageListing);
	addEvent("click", document.getElementById("terminal_close_button"), function () { windowStacks[1].hide() });
	addEvent("click", document.getElementById("about_close_button"), function () { windowStacks[2].hide() });
	addEvent("click", document.getElementById("settings_close_button"), function () { windowStacks[3].hide() });
	addEvent("click", document.getElementById("input_select_close_button"), function () { windowStacks[4].hide() });
	addEvent("click", document.getElementById("instructions_close_button"), function () { windowStacks[5].hide() });
	addEvent("click", document.getElementById("local_storage_list_close_button"), function () { windowStacks[7].hide() });
	addEvent("click", document.getElementById("local_storage_popup_close_button"), function () { windowStacks[6].hide() });
	addEvent("click", document.getElementById("GameBoy_about_menu"), function () { windowStacks[2].show() });
	addEvent("click", document.getElementById("GameBoy_settings_menu"), function () { windowStacks[3].show() });
	addEvent("click", document.getElementById("local_storage_list_menu"), function () { refreshStorageListing(); windowStacks[7].show(); });
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
	addEvent("MozOrientation", window, GameBoyGyroSignalHandler);
	addEvent("deviceorientation", window, GameBoyGyroSignalHandler);
	new popupMenu(document.getElementById("GameBoy_file_menu"), document.getElementById("GameBoy_file_popup"));
	addEvent("click", document.getElementById("data_uri_clicker"), function () {
		var datauri = prompt("Please input the ROM image's Base 64 Encoded Text:", "");
		if (datauri != null && datauri.length > 0) {
			try {
				cout(Math.floor(datauri.length * 3 / 4) + " bytes of data submitted by form (text length of " + datauri.length + ").", 0);
				start(mainCanvas, base64_decode(datauri));
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
							start(mainCanvas, romStream);
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
	addEvent("click", document.getElementById("set_speed"), function () {
		if (GameBoyEmulatorInitialized()) {
			var speed = prompt("Set the speed multiplier here:", "1.0");
			if (speed != null && speed.length > 0) {
				gameboy.setEmulatorSpeed(Math.min(Math.max(parseFloat(speed), 0.01), 50));
				gameboy.initSound();
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
									start(mainCanvas, this.result);
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
							start(mainCanvas, romImageString);
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
		if (GameBoyEmulatorInitialized()) {
			try {
				if (!gameboy.fromSaveState) {
					start(mainCanvas, gameboy.getROMImage());
					initPlayer();
				}
				else {
					openState(gameboy.savedStateFileName, mainCanvas);
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
	addEvent("click", document.getElementById("save_SRAM_state_clicker"), function () {
		saveSRAM();
	});
	addEvent("click", document.getElementById("enable_sound"), function () {
		settings[0] = document.getElementById("enable_sound").checked;
		if (GameBoyEmulatorInitialized()) {
			gameboy.initSound();
		}
	});
	addEvent("click", document.getElementById("enable_mono_sound"), function () {
		settings[1] = document.getElementById("enable_mono_sound").checked;
		if (GameBoyEmulatorInitialized()) {
			gameboy.initSound();
		}
	});
	addEvent("click", document.getElementById("disable_colors"), function () {
		settings[2] = document.getElementById("disable_colors").checked;
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
	});
	addEvent("click", document.getElementById("do_minimal"), function () {
		settings[19] = document.getElementById("do_minimal").checked;
		fullscreenCanvas.className = (settings[19]) ? "minimum" : "maximum";
	});
	addEvent("click", document.getElementById("software_resizing"), function () {
		settings[18] = document.getElementById("software_resizing").checked;
		if (GameBoyEmulatorInitialized()) {
			initNewCanvas();
		}
	});
	addEvent("click", document.getElementById("typed_arrays_disallow"), function () {
		settings[5] = document.getElementById("typed_arrays_disallow").checked;
	});
	addEvent("click", document.getElementById("gb_boot_rom_utilized"), function () {
		settings[20] = document.getElementById("gb_boot_rom_utilized").checked;
	});
	addEvent("click", document.getElementById("view_fullscreen"), fullscreenPlayer);
	new popupMenu(document.getElementById("GameBoy_view_menu"), document.getElementById("GameBoy_view_popup"));
	addEvent("click", document.getElementById("view_terminal"), function () { windowStacks[1].show() });
	addEvent("click", document.getElementById("view_instructions"), function () { windowStacks[5].show() });
	addEvent("mouseup", document.getElementById("gfx"), onResizeOutput);
	addEvent("resize", window, onResizeOutput);
	addEvent("unload", window, function () {
		autoSave();
	});
	addEvent("MozBeforePaint", window, MozVBlankSyncHandler);
}
function onResizeOutput() {
	if (GameBoyEmulatorInitialized()) {
		initNewCanvasSize();
	}
}
function initNewCanvasSize() {
	if (!settings[18]) {
		if (gameboy.width != 160 || gameboy.height != 144 || gameboy.canvas.width != 160 || gameboy.canvas.height != 144) {
			gameboy.canvas.width = gameboy.width = 160;
			gameboy.canvas.height = gameboy.height = 144;
		}
	}
	else {
		if (gameboy.width != gameboy.canvas.clientWidth || gameboy.height != gameboy.canvas.clientHeight || gameboy.canvas.width != gameboy.canvas.clientWidth || gameboy.canvas.height != gameboy.canvas.clientHeight) {
			gameboy.canvas.width = gameboy.width = gameboy.canvas.clientWidth;
			gameboy.canvas.height = gameboy.height = gameboy.canvas.clientHeight;
		}
		gameboy.initLCD();
	}
}
function initNewCanvas() {
	if (!settings[18]) {
		gameboy.canvas.width = gameboy.width = 160;
		gameboy.canvas.height = gameboy.height = 144;
	}
	else {
		gameboy.canvas.width = gameboy.width = gameboy.canvas.clientWidth;
		gameboy.canvas.height = gameboy.height = gameboy.canvas.clientHeight;
	}
	gameboy.initLCD();
}
function initPlayer() {
	if (GameBoyEmulatorInitialized()) {
		initNewCanvasSize();
	}
	document.getElementById("title").style.display = "none";
	document.getElementById("port_title").style.display = "none";
	document.getElementById("fullscreenContainer").style.display = "none";
}
function fullscreenPlayer() {
	if (GameBoyEmulatorInitialized()) {
		if (!inFullscreen) {
			gameboy.canvas = fullscreenCanvas;
			fullscreenCanvas.className = (settings[19]) ? "minimum" : "maximum";
			document.getElementById("fullscreenContainer").style.display = "block";
			windowStacks[0].hide();
		}
		else {
			gameboy.canvas = mainCanvas;
			document.getElementById("fullscreenContainer").style.display = "none";
			windowStacks[0].show();
		}
		initNewCanvas();
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
						openState(states[romState], mainCanvas);
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
}//Wrapper for localStorage removesetItem, so that data can be set in various types.
function deleteValue(key) {
	try {
		window.localStorage.removeItem(key);
	}
	catch (error) {
		//An older Gecko 1.8.1/1.9.0 method of storage (Deprecated due to the obvious security hole):
		window.globalStorage[location.hostname].removeItem(key);
	}
}

function outputLocalStorageLink(keyName, dataFound) {
	return generateLink("data:application/octet-stream;base64," + dataFound, keyName);
}
function refreshStorageListing() {
	var storageListMasterDivSub = document.getElementById("storageListingMasterContainerSub");
	var storageListMasterDiv = document.getElementById("storageListingMasterContainer");
	storageListMasterDiv.removeChild(storageListMasterDivSub);
	storageListMasterDivSub = document.createElement("div");
	storageListMasterDivSub.id = "storageListingMasterContainerSub";
	var keys = getLocalStorageKeys();
	while (keys.length > 0) {
		storageListMasterDivSub.appendChild(outputLocalStorageRequestLink(keys.shift()));
	}
	storageListMasterDiv.appendChild(storageListMasterDivSub);
}
function outputLocalStorageRequestLink(keyName) {
	var linkNode = generateLink("javascript:popupStorageDialog(\"" + keyName + "\")", keyName);
	var storageContainerDiv = document.createElement("div");
	storageContainerDiv.className = "storageListingContainer";
	storageContainerDiv.appendChild(linkNode)
	return storageContainerDiv;
}
function popupStorageDialog(keyName) {
	var subContainer = document.getElementById("storagePopupMasterContainer");
	var parentContainer = document.getElementById("storagePopupMasterParent");
	parentContainer.removeChild(subContainer);
	subContainer = document.createElement("div");
	subContainer.id = "storagePopupMasterContainer";
	parentContainer.appendChild(subContainer);
	var downloadDiv = document.createElement("div");
	downloadDiv.id = "storagePopupDownload";
	downloadDiv.appendChild(outputLocalStorageLink("Download save data.", base64(convertToBinary(findValue(keyName)))));
	var deleteLink = generateLink("javascript:deleteStorageSlot(\"" + keyName + "\")", "Delete save slot.");
	deleteLink.id = "storagePopupDelete";
	subContainer.appendChild(downloadDiv);
	subContainer.appendChild(deleteLink);
	windowStacks[6].show();
}
function convertToBinary(jsArray) {
	var length = jsArray.length;
	var binString = "";
	for (var indexBin = 0; indexBin < length; indexBin++) {
		binString += String.fromCharCode(jsArray[indexBin]);
	}
	return binString;
}
function deleteStorageSlot(keyName) {
	deleteValue(keyName);
	windowStacks[6].hide();
	refreshStorageListing();
}
function generateLink(address, textData) {
	var link = document.createElement("a");
	link.setAttribute("href", address);
	link.appendChild(document.createTextNode(textData));
	return link;
}
function checkStorageLength() {
	try {
		return window.localStorage.length;
	}
	catch (error) {
		//An older Gecko 1.8.1/1.9.0 method of storage (Deprecated due to the obvious security hole):
		return window.globalStorage[location.hostname].length;
	}
}
function getLocalStorageKeys() {
	var storageLength = checkStorageLength();
	var keysFound = [];
	var index = 0;
	var nextKey = null;
	while (index < storageLength) {
		nextKey = findKey(index++);
		if (nextKey !== null && nextKey.length > 0) {
			if (nextKey.substring(0, 5) == "SRAM_") {
				keysFound.push(nextKey);
			}
		}
		else {
			break;
		}
	}
	return keysFound;
}
function findKey(keyNum) {
	try {
		return window.localStorage.key(keyNum);
	}
	catch (error) {
		//An older Gecko 1.8.1/1.9.0 method of storage (Deprecated due to the obvious security hole):
		return window.globalStorage[location.hostname].key(keyNum);
	}
	return null;
}
//Some wrappers and extensions for non-DOM3 browsers:
function isDescendantOf(ParentElement, toCheck) {
	if (!ParentElement || !toCheck) {
		return false;
	}
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