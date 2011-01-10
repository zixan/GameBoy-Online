//Cross-Browser Ajax Access
//(c) 2009-10 - Grant Galitz
function Ajax() {
	this.typeCheck("object", arguments[0]);
	if (arguments[0] != null) {
		this.Method = 3;
		this.MethodCodes = [
			"XMLHttpRequest",
			"ActiveXObject",
			"iFrameMethod",
			"NONE"
		];
		this.Status = 0;
		this.StatusCodes = [
			"initializing",
			"loading",
			"complete",
			"failed"
		];
		this.pArguments = null, this.sURL = "", this.sXMLURL = "", this.sIFrameURL = "", this.sActiveXURL = "", this.sSelectedURL = "",
		this.bReadyStateChangeSupported = false, this.bAsynchronous = true, this.bCached = false, this.bEmptyResponseAllowed = false,
		this.fFail = function () { }, this.fLoading = function () { }, this.bAcceptEnforce = true, this.sAcceptType = "AUTO",
		this.ajaxHandle = null, this.fComplete = function () { }, this.aPost = [], this.aGet = [], this.nTimeout = 60,
		this.aOrder = [0, 1, 2], this.bRetryAllowed = true, this.nIFrameSafeTimeout = 1000, this.aXMLPost = [], this.aActiveXPost = [],
		this.aIFramePost = [], this.aXMLGet = [], this.aActiveXGet = [], this.aIFrameGet = [], this.aSelectedGet = [], this.aSelectedPost = [],
		this.sSelectedAcceptType = "AUTO", this.sXMLAcceptType = "AUTO", this.sActiveXAcceptType = "AUTO", this.sIFrameAcceptType = "AUTO";
		this.StartTime = this.timestamp();
		for (arg in arguments[0]) {
			switch (arg) {
				case "URL":
				case "XMLURL":
				case "ActiveXURL":
				case "IFrameURL":
				case "Accept":
				case "XMLAccept":
				case "ActiveXAccept":
				case "IFrameAccept":
					this.typeCheck("string", arguments[0][arg]);
					break;
				case "Asynchronous":
				case "Cached":
				case "EmptyResponseAllowed":
				case "AcceptEnforce":
				case "TryBackup":
					this.typeCheck("boolean", arguments[0][arg]);
					break;
				case "Fail":
				case "Loading":
				case "Complete":
					this.typeCheck("function", arguments[0][arg]);
					break;
				case "POST":
				case "XMLPOST":
				case "ActiveXPOST":
				case "IFramePOST":
				case "GET":
				case "XMLGET":
				case "ActiveXGET":
				case "IFrameGET":
				case "ORDER":
					this.typeCheck("object", arguments[0][arg]);
					break;
				case "Timeout":
				case "IFrameSafeTimeout":
					this.typeCheck("number", arguments[0][arg]);
			}
			switch (arg) {
				case "XMLURL":
					this.sXMLURL = arguments[0][arg];
					break;
				case "IFrameURL":
					this.sIFrameURL = arguments[0][arg];
					break;
				case "ActiveXURL":
					this.sActiveXURL = arguments[0][arg];
					break;
				case "URL":
					this.sURL = arguments[0][arg];
					break;
				case "Accept":
					this.sAcceptType = arguments[0][arg];
					break;
				case "XMLAccept":
					this.sXMLAcceptType = arguments[0][arg];
					break;
				case "ActiveXAccept":
					this.sActiveXAcceptType = arguments[0][arg];
					break;
				case "IFrameAccept":
					this.sIFrameAcceptType = arguments[0][arg];
					break;
				case "Asynchronous":
					this.bAsynchronous = arguments[0][arg];
					break;
				case "Cached":
					this.bCached = arguments[0][arg];
					break;
				case "EmptyResponseAllowed":
					this.bEmptyResponseAllowed = arguments[0][arg];
					break;
				case "AcceptEnforce":
					this.bAcceptEnforce = arguments[0][arg];
					break;
				case "TryBackup":
					this.bRetryAllowed = arguments[0][arg];
					break;
				case "Fail":
					this.fFail = arguments[0][arg];
					break;
				case "Loading":
					this.fLoading = arguments[0][arg];
					break;
				case "Complete":
					this.fComplete = arguments[0][arg];
					break;
				case "POST":
					this.aPost = arguments[0][arg];
					break;
				case "XMLPOST":
					this.aXMLPost = arguments[0][arg];
					break;
				case "ActiveXPOST":
					this.aActiveXPost = arguments[0][arg];
					break;
				case "IFramePOST":
					this.aIFramePost = arguments[0][arg];
					break;
				case "GET":
					this.aGet = arguments[0][arg];
					break;
				case "XMLGET":
					this.aXMLGet = arguments[0][arg];
					break;
				case "ActiveXGET":
					this.aActiveXGet = arguments[0][arg];
					break;
				case "IFrameGET":
					this.aIFrameGet = arguments[0][arg];
					break;
				case "ORDER":
					this.aOrder = arguments[0][arg];
					break;
				case "Timeout":
					this.nTimeout = arguments[0][arg];
					break;
				case "Arguments":
					this.pArguments = arguments[0][arg];
					break;
				case "IFrameSafeTimeout":
					this.nIFrameSafeTimeout = arguments[0][arg];
			}
		}
	}
	this.launch();
}
Ajax.prototype.typeCheck = function (type, vDetermine) {
	if (typeof vDetermine != type) {
		throw("Type of a variable found is invalid");
	}
}
Ajax.prototype.timestamp = function () {
	return new Date().getTime();
}
Ajax.prototype.status = function () {
	return this.StatusCodes[this.Status];
}
Ajax.prototype.abort = function () {
	this.ajaxHandle.abort();
	this.Status = 2;
}
Ajax.prototype.method = function () {
	return this.MethodCodes[this.Method];
}
Ajax.prototype.update = function () {
	this.Status = 1;
	this.StartTime = this.timestamp();
	this.run();
}
Ajax.prototype.setupMethodProperties = function () {
	this.aSelectedGet = this.aGet;
	this.aSelectedPost = this.aPost;
	this.sSelectedURL = this.sURL;
	this.sSelectedAcceptType = this.sAcceptType;
	switch (this.Method) {
		case 0:
			if (this.sXMLURL != "") {
				this.aSelectedGet = this.aXMLGet;
				this.aSelectedPost = this.aXMLPost;
				this.sSelectedURL = this.sXMLURL;
				this.sSelectedAcceptType = this.sXMLAcceptType;
			}
			break;
		case 1:
			if (this.sActiveXURL != "") {
				this.aSelectedGet = this.aActiveXGet;
				this.aSelectedPost = this.aActiveXPost;
				this.sSelectedURL = this.sActiveXURL;
				this.sSelectedAcceptType = this.sActiveXAcceptType;
			}
			break;
		case 2:
			if (this.sIFrameURL != "") {
				this.aSelectedGet = this.aIFrameGet;
				this.aSelectedPost = this.aIFramePost;
				this.sSelectedURL = this.sIFrameURL;
				this.sSelectedAcceptType = this.sIFrameAcceptType;
			}
	}
}
Ajax.prototype.errorCaught = function (error) {
	for (var index = 0; index < this.aOrder.length; index++) {
		if (this.aOrder[index] == this.Method) {
			this.aOrder[index] = -1;	//Remove access method, as it failed.
		}
	}
	if (this.bRetryAllowed && this.lookupMethods()) {
		this.ajaxHandle.abort();
		this.update();
	}
	else {
		this.Status = 3;
		this.ajaxHandle.abort();
		this.fFail(error, this.pArguments);
	}
}
Ajax.prototype.CheckXMLHttpRequest = function () {
	try {
		this.ajaxHandle = new XMLHttpRequest;
	}
	catch (error) {
		return false;
	}
	this.Method = 0;
	return true;
}
Ajax.prototype.CheckActiveXObject = function () {
	try {
		this.ajaxHandle = new ActiveXObject("Msxml2.XMLHTTP.6.0");
	}
	catch (error) {
		try {
			this.ajaxHandle = new ActiveXObject("Msxml2.XMLHTTP.3.0");
		}
		catch (error) {
			try {
				this.ajaxHandle = new ActiveXObject("Msxml2.XMLHTTP");
			}
			catch (error) {
				try {
					this.ajaxHandle = new ActiveXObject("Microsoft.XMLHTTP");
				}
				catch (error) {
					return false;
				}
			}
		}
	}
	this.Method = 1;
	return true;
}
Ajax.prototype.CheckiFrameMethod = function () {
	try {
		this.ajaxHandle = new iFrameMethod(this);
	}
	catch (error) {
		return false;
	}
	this.Method = 2;
	return true;
}
Ajax.prototype.lookupMethods = function () {
	var bMethodFound = false;
	for (var index = 0; index < this.aOrder.length; index++) {
		switch (this.aOrder[index]) {
			case 0:
				bMethodFound = this.CheckXMLHttpRequest();
				break;
			case 1:
				bMethodFound = this.CheckActiveXObject();
				break;
			case 2:
				bMethodFound = this.CheckiFrameMethod();
		}
		if (bMethodFound) {
			this.setupMethodProperties();
			return true;
		}
	}
	return false;
}
Ajax.prototype.launch = function () {
	if (this.lookupMethods()) {
		this.Status = 1;
		this.fLoading();
		this.run();
	}
	else {
		this.errorCaught("No data transport method could be found.");
	}
}
Ajax.prototype.run = function () {
	try {
		if (this.Method <= 1) {
			this.ajaxHandle.open((this.aSelectedPost.length > 0) ? "POST" : "GET", this.sSelectedURL + this.composeGET(), this.bAsynchronous);
			if (this.aSelectedPost.length > 0) {
				this.ajaxHandle.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
			}
			if (typeof this.ajaxHandle.timeout == "number") {
				this.ajaxHandle.timeout = this.nTimeout * 1000;
			}
			if (this.bAsynchronous) {
				if (typeof this.ajaxHandle.onreadystatechange != "undefined") {
					this.bReadyStateChangeSupported = true;
					var thisObj = this;
					this.ajaxHandle.onreadystatechange = function () {
						thisObj.checkWait();
					}
				}
				else {
					this.checkWait();
				}
			}
			this.ajaxHandle.send((this.aSelectedPost.length > 0) ? this.composePOST() : null);
			if (!this.bAsynchronous) {
				if (!this.checkHTTPCode(this.ajaxHandle)) {
					this.lookupResponse();
				}
				else {
					throw("Target file not found.");
				}
			}
		}
		else {
			this.ajaxHandle.generateFrame();
		}
	}
	catch (error) {
		this.errorCaught(error);
	}
}
Ajax.prototype.composeGET = function () {
	var index;
	var getString = "";
	var aLocalGet = this.aSelectedGet.slice(0);
	if (!this.bCached) {
		aLocalGet[aLocalGet.length] = "ajaxtimestamp=" + this.timestamp();
	}
	for (index = 0; index < aLocalGet.length; index++) {
		getString += ((index == 0) ? "?" : "&");
		getString += aLocalGet[index];
	}
	return getString;
}
Ajax.prototype.composePOST = function () {
	var postString = "";
	var index;
	for (index = 0; index < this.aSelectedPost.length; index++) {
		postString += this.aSelectedPost[index];
		if ((index + 1) < this.aSelectedPost.length) {
			postString += "&";
		}
	}
	return postString;
}
Ajax.prototype.lookupResponse = function () {
	var XML = null;
	var TEXT = null;
	var HTML = null;
	if (this.Status == 1) {
		if (typeof this.ajaxHandle.responseXML == "object") {
			XML = this.inspectXML(this.ajaxHandle.responseXML);
		}
		if (typeof this.ajaxHandle.responseHTML == "object") {
			HTML = this.inspectXML(this.ajaxHandle.responseHTML);
		}
		if (typeof this.ajaxHandle.responseText == "string") {
			TEXT = this.ajaxHandle.responseText;
			if (XML == null) {
				var responseXML = null;
				try {
					responseXML = new DOMParser().parseFromString(this.ajaxHandle.responseText, "text/xml");
				}
				catch (error) {
					try {
						responseXML = new ActiveXObject("Microsoft.XMLDOM");
						responseXML.async = "false";
						responseXML.loadXML(this.ajaxHandle.responseText);
					}
					catch (error) { }
				}
				XML = this.inspectXML(responseXML);
			}
		}
		else if (HTML != null) {
			try {
				if (HTML.outerHTML != null) {
					TEXT = HTML.outerHTML;
				}
			}
			catch (error) {
				//XML documents in some browsers don't use outerHTML (only for HTML).
			}
		}
		if (XML != null || TEXT != null || HTML != null || this.bEmptyResponseAllowed) {
			if (this.bAcceptEnforce && !this.bEmptyResponseAllowed && (this.sSelectedAcceptType == "HTML" || this.sSelectedAcceptType == "XML" || this.sSelectedAcceptType == "TEXT")) {
				switch (this.sSelectedAcceptType) {
					case "HTML":
						if (HTML == null) {
							throw("No HTML output.");
						}
						break;
					case "TEXT":
						if (TEXT == null) {
							throw("No TEXT output.");
						}
						break;
					case "XML":
						if (XML == null) {
							throw("No XML output.");
						}
						break;
				}
			}
			this.Status = 2;
			try {
				this.fComplete(
					XML,
					TEXT,
					HTML,
					this.pArguments
				);
			}
			catch (error) {
				this.errorCaught(error);
			}
		}
		else {
			throw("No data downloaded");
		}
	}
}
Ajax.prototype.inspectXML = function (responseXML) {
	if (typeof responseXML == "object" && responseXML != null) {
		if (typeof responseXML.documentElement == "object") {
			return responseXML;
		}
	}
	return null;
}
Ajax.prototype.checkHTTPCode = function (handle) {
	var bBadRequest = false;
	if (handle.readyState >= 3) {
		if (typeof handle.status == "number") {
			if (handle.status < 200 || handle.status >= 300) {
				bBadRequest = true;
			}
		}
		/*else if (typeof handle.statusText == "string") {
			if (handle.statusText.toUpperCase() != "OK") {
				bBadRequest = true;
			}
		}*/
	}
	return bBadRequest;
}
Ajax.prototype.checkWait = function () {
	try {
		if (this.Status == 3 || this.Status == 2 || typeof this.ajaxHandle.readyState != "number") {
			return;
		}
		if (this.checkHTTPCode(this.ajaxHandle)) {
			//Abort after this.Status has changed, to prevent duplicate errors.
			throw("Target file not found.");
		}
		switch (this.ajaxHandle.readyState) {
			case 1:
			case 2:
			case 3:
				if ((this.timestamp() - this.StartTime) < (this.nTimeout * 1000)) {
					if (!this.bReadyStateChangeSupported) {
						var thisObj = this;
						setTimeout(function () { thisObj.checkWait(); }, 1);
					}
				}
				else {
					throw("Timeout was reached by " + ((this.timestamp() - this.StartTime) / 1000) + " seconds.");
				}
				break;
			case 4:
				this.lookupResponse();
				return;
		}
	}
	catch (error) {
		this.errorCaught(error);
	}
}
function iFrameMethod(XHRVars) {
	//IE 5 fails.
	//IE 5 5.5-6 Can only do responseHTML.
	this.XHRVars = XHRVars;
	this.responseXML = null;
	this.responseHTML = null;
	this.iframe = null;
	this.formElement = null;
	this.count = 0;
	this.cleaned = false;
}
iFrameMethod.prototype.generateFrame = function () {
	while (document.getElementById("iframe_" + this.count) != null) {
		this.count++;
	}
	this.iframe = document.createElement("iframe");
	this.hide(this.iframe);
	if (this.XHRVars.aSelectedPost.length == 0) {
		//GET Request
		this.iframe.src = this.XHRVars.sSelectedURL + this.XHRVars.composeGET();
	}
	else {
		//POST Request
		this.iframe.id = "iframe_" + this.count;                                                                                                //Some browsers ignore the name attribute and use this instead (incorrect behavior).
		this.iframe.name = "iframe_" + this.count;
		this.formSetup();
	}
	var thisObj = this;
	if (typeof this.iframe.attachEvent != "undefined") {                                                                                            //MSIE Event Model
		this.iframe.attachEvent("onload", function () {
			thisObj.populateXHR();
		});
	}
	else if (typeof this.iframe.onreadystatechange != "undefined") {
		this.iframe.onreadystatechange = function () {                                                                                          //DOM Event Model
			thisObj.populateXHR();
		}
	}
	else if (typeof this.iframe.addEventListener != "undefined") {
		this.iframe.addEventListener("load", function () {                                                                                      //DOM Event Model
			thisObj.populateXHR();
		}, false);
	}
	else {
		this.iframe.onload = function () {                                                                                                      //DOM onload Event
			thisObj.populateXHR();
		}
	}
	document.getElementsByTagName("body")[0].appendChild(this.iframe);
	if (this.formElement != null) {
		if (typeof window.self == "object" && window.self != null) {
			if (typeof window.self.frames == "object" && window.self.frames != null) {                                                      //DOM 0 check
				if (typeof window.self.frames["iframe_" + this.count] == "object" && window.self.frames["iframe_" + this.count] != null) {
					if (window.self.frames["iframe_" + this.count].name != "iframe_" + this.count) {
						window.self.frames["iframe_" + this.count].name = "iframe_" + this.count;                               //IE 5-7 Fix
					}
				}
			}
		}
		this.formElement.submit();                                                                                                              //Submit the POST request
	}
	setTimeout(function () {
		thisObj.errorMessage("iFrame failed to load.");
	}, thisObj.XHRVars.nTimeout * 1000);
}
iFrameMethod.prototype.formSetup = function () {
	this.formElement = document.createElement("form");
	this.hide(this.formElement);
	this.formElement.action = this.XHRVars.sSelectedURL + this.XHRVars.composeGET();
	this.formElement.method = "post";
	this.formElement.target = "iframe_" + this.count;
	var data = this.XHRVars.aSelectedPost;
	for (var index = 0; index < data.length; index++) {
		var inputElement = document.createElement("input");
		this.hide(inputElement);
		inputElement.type = "hidden";
		var part = data[index].split("=");
		inputElement.name = unescape(part[0]);
		inputElement.value = unescape(part[1]);
		this.formElement.appendChild(inputElement);
	}
	document.getElementsByTagName("body")[0].appendChild(this.formElement);
}
iFrameMethod.prototype.hide = function (element) {
	element.style.visibility = "hidden";
	element.style.height = "0px";
	element.style.width = "0px";
	element.margin = "0px";
	element.padding = "0px";
	element.style.zIndex = 100000;
	element.style.position = "absolute";
	element.style.top = "0px";
	element.style.left = "0px";
}
iFrameMethod.prototype.errorMessage = function (message) {
	if (this.XHRVars.Status == 1) {
		this.XHRVars.errorCaught(message);
	}
}
iFrameMethod.prototype.finish = function () {
	if (this.XHRVars.Status == 1 && !this.cleaned) {
		this.clean();                                                                                                                                    //Free some DOM nodes.
		try {
			this.XHRVars.lookupResponse();                                                                                                           //Start the data processing.
		}
		catch (error) {
			this.errorMessage(error);
		}
	}
}
iFrameMethod.prototype.abort = function () {
	this.clean();                                                                                                                                            //Free some DOM nodes.
}
iFrameMethod.prototype.clean = function () {
	if (!this.cleaned && this.iframe != null) {
		this.cleaned = true;
		if (this.formElement != null) {
			this.formElement.parentNode.removeChild(this.formElement);                                                                              //Free up some memory to make things faster.
		}
	}
}
iFrameMethod.prototype.isHTML = function (HTMLData) {                                                                                                           //Shallow Testing For an HTML document.
	if (HTMLData != null) {
		if (HTMLData.documentElement != null) {
			if (HTMLData.documentElement.nodeName.toUpperCase() == "HTML") {
				if (HTMLData.getElementsByTagName("body").length == 1) {
					return true;
				}
			}
		}
	}
	return false;
}
iFrameMethod.prototype.populateXHR = function () {
	try {
		if (this.iframe != null && !this.cleaned) {
			if (this.XHRVars.Status == 1) {
				var this2 = this;
				//Check Readiness:
				if (typeof this.iframe.readyState != "undefined") {
					if (this.iframe.readyState != "complete") {                                                                             //MSIE readyState Access
						setTimeout(function () {
							this2.populateXHR();                                                                                    //Loop again until the document is ready.
						}, 1);
						return;
					}
				}
				else if (typeof this.iframe.contentDocument.readyState != "undefined") {
					if (this.iframe.contentDocument.readyState != "complete") {                                                             //DOM readyState Access
						setTimeout(function () {
							this2.populateXHR();                                                                                    //Loop again until the document is ready.
						}, 1);
						return;
					}
				}
				//Look for the XML DOM Access Point:
				if (typeof this.iframe.contentWindow != "undefined") {										//MSIE Standard (First, as MSIE attempts at the standard, but fails)
					if (typeof this.iframe.contentWindow.document != "undefined") {
						this.responseHTML = this.iframe.contentWindow.document;                                                         //MSIE HTML Standard
						if (typeof this.iframe.contentWindow.document.XMLDocument != "undefined") {
							this.responseXML = this.iframe.contentWindow.document.XMLDocument;                                      //Proper way to access the XML DOM in MSIE (HTML not the root node).
						}
						else if (typeof this.iframe.contentDocument != "undefined") {                                                   //DOM Standard
							this.responseXML = this.iframe.contentDocument;
						}
					}
					else if (typeof this.iframe.contentDocument != "undefined") {                                                           //DOM Standard
						this.responseXML = this.iframe.contentDocument;
					}

				}
				else if (typeof this.iframe.contentDocument != "undefined") {                                                                   //DOM Standard
					this.responseXML = this.iframe.contentDocument;
				}
				if (this.responseXML != null && this.responseHTML == null) {
					this.responseHTML = this.responseXML;
				}
				if (this.responseXML != null) {
					if (this.responseXML.hasChildNodes()) {
						if (!this.isHTML(this.responseXML)) {                                                                           //Quickly check for nesting and a ready DOM.
							this.finish();
						}
						else if (this.XHRVars.sSelectedAcceptType == "HTML" && this.isHTML(this.responseHTML)) {
							setTimeout(function () {                                                                                //If HTML available, OK
								this2.finish();
							}, this2.XHRVars.nIFrameSafeTimeout);
						}
						else if (typeof this.iframe.contentDocument.readyState != "undefined" || typeof this.iframe.readyState != "undefined") {
							//Loop for those who do support the readyState but aren't really ready quite yet (Critical WebKit DOM bug for the POST method):
							setTimeout(function () {
								this2.populateXHR();                                                                            //Loop again until the document is ready.
							}, 1);
						}
						else {
							//Loop for those who don't support the readyState:
							setTimeout(function () {
								this2.populateXHR();                                                                            //Loop again until the document is ready.
							}, this2.XHRVars.nIFrameSafeTimeout);                                                                                               //Give ample time for some browsers to create the iframe's DOM tree who don't support the readyState.
						}
					}
					else {
						throw("Browser does not support ajax (DOM did not have root node).");
					}
				}
				else if (this.isHTML(this.responseHTML)) {
					setTimeout(function () {                                                                                                //If HTML available, OK
						this2.finish();
					}, this2.XHRVars.nIFrameSafeTimeout);
				}
				else {
					throw("Browser does not support ajax (DOM was null).");
				}
			}
		}
		else {
			throw("Browser does not support ajax (iframe was null).");
		}
	}
	catch (error) {
		this.errorMessage(error);
	}
}
