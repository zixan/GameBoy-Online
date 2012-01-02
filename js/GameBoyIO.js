var gameboy = null;						//GameBoyCore object.
var gbRunInterval;						//GameBoyCore Timer
var settings = [						//Some settings.
	true, 								//Turn on sound.
	false,								//Force Mono sound.
	false,								//Give priority to GameBoy mode
	[39, 37, 38, 40, 88, 90, 16, 13],	//Keyboard button map.
	0,									//Frameskip Amount (Auto frameskip setting allows the script to change this.)
	false,								//Disallow typed arrays?
	16,									//Interval for the emulator loop.
	false,								//Auto Frame Skip
	29,									//Maximum Frame Skip
	false,								//Override to allow for MBC1 instead of ROM only (compatibility for broken 3rd-party cartridges).
	false,								//Override MBC RAM disabling and always allow reading and writing to the banks.
	false,								//Vertical blank event availability.
	10,									//Frameskip base factor
	false,								//Enable the software scaling algorithm to be compiled through JIT.
	256000,								//Sample Rate
	false,								//MozBeforePaint support detected.
	true,								//Use the GBC BIOS?
	true,								//Colorize GB mode?
	false,								//Render nearest-neighbor scaling in javascript?
	false,								//Whether to display the canvas at 144x160 on fullscreen or as stretched.
	false								//Use the GameBoy boot ROM instead og the GameBoy Color boot ROM.
];
function start(canvas, ROM) {
	clearLastEmulation();
	autoSave();	//If we are about to load a new game, then save the last one...
	gameboy = new GameBoyCore(canvas, ROM);
	gameboy.openMBC = openSRAM;
	gameboy.openRTC = openRTC;
	gameboy.start();
	run();
}
function run() {
	if (GameBoyEmulatorInitialized()) {
		if (!GameBoyEmulatorPlaying()) {
			gameboy.stopEmulator &= 1;
			cout("Starting the iterator.", 0);
			var dateObj = new Date();
			gameboy.firstIteration = dateObj.getTime();
			gameboy.iterations = 0;
			gbRunInterval = setInterval(function () {
				if (!document.hidden && !document.msHidden && !document.mozHidden && !document.webkitHidden) {
					gameboy.run();
				}
			}, settings[6]);
		}
		else {
			cout("The GameBoy core is already running.", 1);
		}
	}
	else {
		cout("GameBoy core cannot run while it has not been initialized.", 1);
	}
}
function pause() {
	if (GameBoyEmulatorInitialized()) {
		if (GameBoyEmulatorPlaying()) {
			clearLastEmulation();
		}
		else {
			cout("GameBoy core has already been paused.", 1);
		}
	}
	else {
		cout("GameBoy core cannot be paused while it has not been initialized.", 1);
	}
}
function clearLastEmulation() {
	if (GameBoyEmulatorInitialized() && GameBoyEmulatorPlaying()) {
		clearInterval(gbRunInterval);
		gameboy.stopEmulator |= 2;
		cout("The previous emulation has been cleared.", 0);
	}
	else {
		cout("No previous emulation was found to be cleared.", 0);
	}
}
function save() {
	if (GameBoyEmulatorInitialized()) {
		try {
			var state_suffix = 0;
			while (findValue(gameboy.name + "_" + state_suffix) != null) {
				state_suffix++;
			}
			setValue(gameboy.name + "_" + state_suffix, gameboy.saveState());
			if (findValue("state_names") == null) {
				setValue("state_names", [gameboy.name + "_" + state_suffix]);
			}
			else {
				var list_of_states = findValue("state_names");
				list_of_states[list_of_states.length] = (gameboy.name + "_" + state_suffix);
				setValue("state_names", list_of_states);
			}
			cout("Saved the current state as: " + gameboy.name + "_" + state_suffix, 0);
			document.getElementById("open_saved_clicker").style.display = "block";
			addSaveStateItem(gameboy.name + "_" + state_suffix);
		}
		catch (error) {
			cout("Could not save the current emulation state(\"" + error.message + "\").", 2);
		}
	}
	else {
		cout("GameBoy core cannot be saved while it has not been initialized.", 1);
	}
}
function saveSRAM() {
	if (GameBoyEmulatorInitialized()) {
		if (gameboy.cBATT) {
			try {
				var sram = gameboy.saveSRAMState();
				if (sram.length > 0) {
					cout("Saving the SRAM...", 0);
					setValue("SRAM_" + gameboy.name, sram);
				}
				else {
					cout("SRAM could not be saved because it was empty.", 1);
				}
			}
			catch (error) {
				cout("Could not save the current emulation state(\"" + error.message + "\").", 2);
			}
		}
		else {
			cout("Cannot save a game that does not have battery backed SRAM specified.", 1);
		}
		saveRTC();
	}
	else {
		cout("GameBoy core cannot be saved while it has not been initialized.", 1);
	}
}
function saveRTC() {	//Execute this when SRAM is being saved as well.
	if (GameBoyEmulatorInitialized()) {
		if (gameboy.cTIMER) {
			try {
				cout("Saving the RTC...", 0);
				setValue("RTC_" + gameboy.name, gameboy.saveRTCState());
			}
			catch (error) {
				cout("Could not save the RTC of the current emulation state(\"" + error.message + "\").", 2);
			}
		}
	}
	else {
		cout("GameBoy core cannot be saved while it has not been initialized.", 1);
	}
}
function autoSave() {
	if (GameBoyEmulatorInitialized()) {
		cout("Automatically saving the SRAM.", 0);
		saveSRAM();
		saveRTC();
	}
}
function openSRAM(filename) {
	try {
		if (findValue("SRAM_" + filename) != null) {
			cout("Found a previous SRAM state (Will attempt to load).", 0);
			return findValue("SRAM_" + filename);
		}
		else {
			cout("Could not find any previous SRAM copy for the current ROM.", 0);
		}
	}
	catch (error) {
		cout("Could not open the  SRAM of the saved emulation state.", 2);
	}
	return [];
}
function openRTC(filename) {
	try {
		if (findValue("RTC_" + filename) != null) {
			cout("Found a previous RTC state (Will attempt to load).", 0);
			return findValue("RTC_" + filename);
		}
		else {
			cout("Could not find any previous RTC copy for the current ROM.", 0);
		}
	}
	catch (error) {
		cout("Could not open the RTC data of the saved emulation state.", 2);
	}
	return [];
}
function openState(filename, canvas) {
	try {
		if (findValue(filename) != null) {
			try {
				clearLastEmulation();
				cout("Attempting to run a saved emulation state.", 0);
				gameboy = new GameBoyCore(canvas, "");
				gameboy.savedStateFileName = filename;
				gameboy.returnFromState(findValue(filename));
				run();
			}
			catch (error) {
				alert(error.message + " file: " + error.fileName + " line: " + error.lineNumber);
			}
		}
		else {
			cout("Could not find the save state \"" + filename + "\".", 2);
		}
	}
	catch (error) {
		cout("Could not open the saved emulation state.", 2);
	}
}
function matchKey(key) {	//Maps a keyboard key to a gameboy key.
	//Order: Right, Left, Up, Down, A, B, Select, Start
	for (var index = 0; index < settings[3].length; index++) {
		if (settings[3][index] == key) {
			return index;
		}
	}
	return -1;
}
function GameBoyEmulatorInitialized() {
	return (typeof gameboy == "object" && gameboy != null);
}
function GameBoyEmulatorPlaying() {
	return ((gameboy.stopEmulator & 2) == 0);
}
function GameBoyKeyDown(e) {
	if (GameBoyEmulatorInitialized() && GameBoyEmulatorPlaying()) {
		var keycode = matchKey(e.keyCode);
		if (keycode >= 0 && keycode < 8) {
			gameboy.JoyPadEvent(keycode, true);
			try {
				e.preventDefault();
			}
			catch (error) { }
		}
	}
}
function GameBoyKeyUp(e) {
	if (GameBoyEmulatorInitialized() && GameBoyEmulatorPlaying()) {
		var keycode = matchKey(e.keyCode);
		if (keycode >= 0 && keycode < 8) {
			gameboy.JoyPadEvent(keycode, false);
			try {
				e.preventDefault();
			}
			catch (error) { }
		}
	}
}
function GameBoyGyroSignalHandler(e) {
	if (GameBoyEmulatorInitialized() && GameBoyEmulatorPlaying()) {
		if (e.gamma || e.beta) {
			gameboy.GyroEvent(e.gamma * Math.PI / 180, e.beta * Math.PI / 180);
		}
		else {
			gameboy.GyroEvent(e.x, e.y);
		}
		try {
			e.preventDefault();
		}
		catch (error) { }
	}
}
function VBlankSyncHandler() {
	if (settings[11] && GameBoyEmulatorInitialized() && GameBoyEmulatorPlaying()) {
		//Draw out our graphics now:
		gameboy.dispatchDraw();
	}
}
function MozVBlankSyncHandler() {
	settings[15] = true;
	if (settings[11] && GameBoyEmulatorInitialized() && GameBoyEmulatorPlaying()) {
		//Draw out our graphics now:
		gameboy.dispatchDraw();
		try {
			window.mozRequestAnimationFrame();
		}
		catch (error) {
			try {
				window.requestAnimationFrame();
			}
			catch (error) { }
		}
	}
}
function requestVBlank(canvasHandle) {
	settings[11] = true;
	if (!settings[15]) {
		try {
			window.mozRequestAnimationFrame(VBlankSyncHandler);
		}
		catch (e) {
			try {
				window.webkitRequestAnimationFrame(VBlankSyncHandler, canvasHandle);
			}
			catch (e) {
				try {
					window.msRequestAnimationFrame(VBlankSyncHandler);
				}
				catch (e) {
					try {
						window.requestAnimationFrame(VBlankSyncHandler);
					}
					catch (e) {
						settings[11] = false;
					}
				}
			}
		}
	}
}