var gameboy = null;						//GameBoyCore object.
var gbRunInterval;						//GameBoyCore Timer
var settings = [						//Some settings.
	true, 								//Turn on sound.
	false,								//Force Mono sound.
	false,								//Give priority to GameBoy mode
	[39, 37, 38, 40, 88, 90, 16, 13],	//Keyboard button map.
	0,									//Frameskip Amount (Auto frameskip setting allows the script to change this.)
	false,								//Use the data URI BMP method over the canvas tag method?
	[16, 12],							//How many tiles in each direction when using the BMP method (width * height).
	true,								//Auto Frame Skip
	29,									//Maximum Frame Skip
	false,								//Override to allow for MBC1 instead of ROM only (compatibility for broken 3rd-party cartridges).
	false,								//Override MBC RAM disabling and always allow reading and writing to the banks.
	null,								//Extra Setting Slot
	10,									//Frameskip base factor
	false,								//Enable the software scaling algorithm to be compiled through JIT.
	70000,								//Sample Rate
	0x10,								//How many bits per WAV PCM sample (For browsers that fall back to WAV PCM generation)
	true,								//Use the GBC BIOS?
	true,								//Colorize GB mode?
	2048,								//Sample size for webkit audio.
	false,								//Whether to display the canvas at 144x160 on fullscreen or as stretched.
	16,									//Interval for the emulator loop.
	false,								//Render nearest-neighbor scaling in javascript?
	false,								//Disallow typed arrays?
	7500,								//Audio Buffer Low Limit.
	25000								//Audio Buffer High Limit
];
function start(canvas, canvasAlt, ROM) {
	clearLastEmulation();
	autoSave();	//If we are about to load a new game, then save the last one...
	gameboy = new GameBoyCore(canvas, canvasAlt, ROM);
	gameboy.openMBC = openSRAM;
	gameboy.openRTC = openRTC;
	gameboy.start();
	run();
}
function run() {
	if (typeof gameboy == "object" && gameboy != null && (gameboy.stopEmulator & 2) == 2) {
		gameboy.stopEmulator &= 1;
		cout("Starting the iterator.", 0);
		var dateObj = new Date();
		gameboy.firstIteration = dateObj.getTime();
		gameboy.iterations = 0;
		gbRunInterval = setInterval(function () { gameboy.run(); }, settings[20]);
	}
	else if ((gameboy.stopEmulator & 2) == 0) {
		cout("The GameBoy core is already running.", 1);
	}
	else {
		cout("GameBoy core cannot run while it has not been initialized.", 1);
	}
}
function pause() {
	if (typeof gameboy == "object" && gameboy != null && (gameboy.stopEmulator & 2) == 0) {
		clearLastEmulation();
	}
	else if ((gameboy.stopEmulator & 2) == 2) {
		cout("GameBoy core has already been paused.", 1);
	}
	else {
		cout("GameBoy core cannot be paused while it has not been initialized.", 1);
	}
}
function clearLastEmulation() {
	if (typeof gameboy == "object" && gameboy != null && (gameboy.stopEmulator & 2) == 0) {
		clearInterval(gbRunInterval);
		gameboy.stopEmulator |= 2;
		cout("The previous emulation has been cleared.", 0);
	}
	else {
		cout("No previous emulation was found to be cleared.", 0);
	}
}
function save() {
	if (typeof gameboy == "object" && gameboy != null) {
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
	if (typeof gameboy == "object" && gameboy != null) {
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
	if (typeof gameboy == "object" && gameboy != null) {
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
	if (typeof gameboy == "object" && gameboy != null) {
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
function openState(filename, canvas, canvasAlt) {
	try {
		if (findValue(filename) != null) {
			try {
				clearLastEmulation();
				cout("Attempting to run a saved emulation state.", 0);
				gameboy = new GameBoyCore(canvas, canvasAlt, "");
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
	cout("Keyboard key #" + key + " was pressed or released, but is not being utilized by the emulator.", 0);
	return -1;
}
function GameBoyKeyDown(e) {
	if (typeof gameboy == "object" && gameboy != null && (gameboy.stopEmulator & 2) == 0) {
		var keycode = matchKey(e.keyCode);
		if (keycode >= 0 && keycode < 8) {
			gameboy.JoyPadEvent(keycode, true);
			try {
				e.preventDefault();
			}
			catch (error) { }
		}
		else {
			cout("Keyboard key press ignored", 1);
		}
	}
	else {
		cout("Keyboard key press ignored, since the core is not running.", 1);
	}
}
function GameBoyKeyUp(e) {
	if (typeof gameboy == "object" && gameboy != null && (gameboy.stopEmulator & 2) == 0) {
		var keycode = matchKey(e.keyCode);
		if (keycode >= 0 && keycode < 8) {
			gameboy.JoyPadEvent(keycode, false);
			try {
				e.preventDefault();
			}
			catch (error) { }
		}
		else {
			cout("Keyboard key release ignored", 1);
		}
	}
	else {
		cout("Keyboard key release ignored, since the core is not running.", 1);
	}
}
function GameBoyGyroSignalHandler(e) {
	if (typeof gameboy == "object" && gameboy != null && (gameboy.stopEmulator & 2) == 0) {
		gameboy.GyroEvent(e.x, e.y);
		try {
			e.preventDefault();
		}
		catch (error) { }
	}
}