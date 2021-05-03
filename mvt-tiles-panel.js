const body = document.body;

const _ge = document.getElementById.bind(document);

const tilesTable = _ge('tilesTable');
const tileContent = _ge('tileContent');
const tileMetadata = _ge('tileMetadata');
const dialog = _ge('viewTileDialog');
const closeButton = document.getElementsByClassName("viewTileDialog_closeButton")[0];

document.addEventListener("click", onDocumentClick);
_ge('clear').addEventListener("click", (e) => {
	if (window.onClear) {
		window.onClear();
	}
	e.preventDefault();
	return false;
});

const trackEmptyResponseCheckBox = _ge('trackEmptyResponse');
const trackOnlySuccessfulResponseCheckBox = _ge('trackOnlySuccessfulResponse');
const mvtRequestPatternText = _ge('mvtRequestPattern');

let selectedRow = undefined;

function clearDialogContent() {
	tileContent.innerHTML = "";
	tileMetadata.innerHTML = "";
}

function closeDialog() {
	clearDialogContent();
	body.classList.remove('withDialog');
	if (selectedRow) {
		selectedRow.classList.remove('selected');
		selectedRow = undefined;
	}
}

closeButton.onclick = closeDialog;

//http://qaru.site/questions/88685/auto-scaling-inputtype-text-to-width-of-value
function getTextWidth(text, fontSize, fontName, fontWeight) {
	let canvas = document.createElement('canvas');
	let context = canvas.getContext('2d');
	context.font = fontWeight + " " + fontSize + " " + fontName;
	return context.measureText(text).width;
}

function tileToGeoJson(tile, z, x, y) {
	const layerNames = Object.keys(tile.layers);
	if (!layerNames.length) {
		return {};
	}
	const geoJsonLayers = {};
	layerNames.forEach((layerName) => {
		const geoJsonLayer = geoJsonLayers[layerName] = {};
		const geoJsonFeatures = geoJsonLayer.features = [];
		const layer = tile.layers[layerName];
		for (let i = 0; i < layer.length; i++) {
			geoJsonFeatures.push(layer.feature(i).toGeoJSON(x, y, z));
		}
	});
	return geoJsonLayers;
}

function getTileMetadata(entry) {
	return {
		requestHeaders: entry.requestHeaders,
		responseHeaders: entry.responseHeaders,
		statistics: entry.statistics,
		url: entry.url,
		x: entry.x,
		y: entry.y,
		z: entry.z
	};
}

function showJSON(value, element) {
	const viewer = new JSONViewer();	
	viewer.showJSON(value, null, 1);
	element.appendChild(viewer.getContainer());
}

function uint8ArrayToBase64(bytes) {
	let binary = '';
	let len = bytes.byteLength;
	for (let i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return window.btoa(binary);
}

const adjustInputTextWidth = (input) => {
	const style = window.getComputedStyle(input);
	const textWidth = getTextWidth(input.value, style.fontSize, style.fontFamily, style.fontWeight);
	input.style.width = (textWidth + 20) + "px";
};

const updateControls = (trackEmptyResponse, trackOnlySuccessfulResponse, mvtRequestPattern) => {
	trackEmptyResponseCheckBox.checked = !!trackEmptyResponse;
	trackOnlySuccessfulResponseCheckBox.checked = !!trackOnlySuccessfulResponse;
	mvtRequestPatternText.value = mvtRequestPattern;
	adjustInputTextWidth(mvtRequestPatternText);
};

const updateSettings = () => {
	chrome.storage.local.set({
			trackEmptyResponse: trackEmptyResponseCheckBox.checked,
			trackOnlySuccessfulResponse: trackOnlySuccessfulResponseCheckBox.checked,
			mvtRequestPattern: mvtRequestPatternText.value
		}, function () {
		}
	)
};

chrome.storage.local.get(['trackEmptyResponse', 'trackOnlySuccessfulResponse', 'mvtRequestPattern'], function ({trackEmptyResponse, trackOnlySuccessfulResponse, mvtRequestPattern}) {
	updateControls(trackEmptyResponse, trackOnlySuccessfulResponse, mvtRequestPattern);
});

chrome.storage.local.onChanged.addListener(function (changes) {
	if (changes['trackEmptyResponse']) {
		trackEmptyResponseCheckBox.checked = !!changes['trackEmptyResponse'].newValue;
	}
	if (changes['trackOnlySuccessfulResponse']) {
		trackOnlySuccessfulResponseCheckBox.checked = !!changes['trackOnlySuccessfulResponse'].newValue;
	}
	if (changes['mvtRequestPattern']) {
		mvtRequestPatternText.value = changes['mvtRequestPattern'].newValue;
	}
});

trackEmptyResponseCheckBox.addEventListener('change', updateSettings);
trackOnlySuccessfulResponseCheckBox.addEventListener('change', updateSettings);
mvtRequestPatternText.addEventListener('keyup', () => {
	adjustInputTextWidth(mvtRequestPatternText);
	updateSettings();
});


function onDocumentClick(e) {
	const dialogIsHidden = window.getComputedStyle(dialog).getPropertyValue("display") === "none";

	let node = e.target;
	while (node && node.getAttribute('role') !== "row" && node.parentElement !== tilesTable) {
		node = node.parentElement;
	}

	if (node && node.getAttribute('role') === "row" && node !== selectedRow && node.entry) {
		clearDialogContent();

		if (dialogIsHidden) {
			body.classList.add('withDialog');
		}

		if (selectedRow) {
			selectedRow.classList.remove('selected');
		}

		selectedRow = node;
		node.classList.add('selected');

		setTimeout(() => {
			prepareGeoJsonTile(node.entry, (geoJsonOrJsonError) => {
				showJSON(getTileMetadata(node.entry), tileMetadata);
				showJSON(geoJsonOrJsonError, tileContent);
				doAutoscrollableOperation();
			});
		}, 0)/*to see that previous content is cleared*/;
	}
}

function prepareGeoJsonTile(entry, callback) {
	const base64TileToUint8Array = (callback/*: (vectorTile, error)=>void*/) => {
		let tile;
		let error;
		const data = entry.tile && Uint8Array.from(atob(entry.tile), c => c.charCodeAt(0)) || null;
		if (data) {
			try {
				tile = new VectorTile.VectorTile(new Pbf(data));
			} catch (e) {
				error = e;
			}
		}
		callback(tile, error, data);
	};

	base64TileToUint8Array((vectorTile, error, data) => {
		if (vectorTile) {
			callback(tileToGeoJson(vectorTile, entry.z, entry.x, entry.y));
		} else {
			const tileCoord = "{z: " + entry.z + ", x: " + entry.x + ", y: " + entry.y + "}";
			const message = "Cannot read Pbf from Base64 string (" +
				"content = " + entry.tile + "," +
				"array" + (data ? "(" + data.length + ")" : "") + " = " + data + "," +
				") for tile " + tileCoord + ". " +
				"MVT will be fetched again... ";
			console.warn(message, error);
			chrome.devtools.inspectedWindow.eval("console.warn('" + message + "')");

			//retry...
			const onLoadFailed = (error) => {
				const message = "... Loading failed for tile " + tileCoord;
				console.error(message, error);
				chrome.devtools.inspectedWindow.eval("console.error('" + message + "')");
				callback({error: message});
			};

			fetchTile(entry).then(() => {
				base64TileToUint8Array((vectorTile, error) => {
					if (vectorTile) {
						callback(tileToGeoJson(vectorTile, entry.z, entry.x, entry.y));
					} else {
						onLoadFailed(error);
					}
				});
			}).catch((error) => {
				onLoadFailed(error);
			});
		}
	});
}

function toMvtLink(entry) {
	const requestUrl = entry.url;
	const a = document.createElement("a");
	a.setAttribute("href", requestUrl);
	a.addEventListener('click', function (e) {
		e.preventDefault();
		e.stopPropagation();

		const fileName = entry.z + "_" + entry.x + "_" + entry.y + ".mvt";
		if (entry.tile) {
			saveFromBinaryData(entry.tile, fileName);
		} else {
			fetchTile(entry).then((buffer) => {
				saveFromBinaryData(new Uint8Array(buffer), fileName);
			}).catch(error => {
				const message = "Loading failed for tile " + "{z: " + entry.z + ", x: " + entry.x + ", y: " + entry.y + "}";
				console.error(message, error);
				chrome.devtools.inspectedWindow.eval("console.error('" + message + "')");
				callback({error: message});
			});
		}
		return false;
	});
	const url = new URL(requestUrl);
	a.textContent = url.pathname + url.search + url.hash;
	return a;
}

function fetchTile(entry) {
	const headers = {...entry.headers};
	if (headers.accept) {
		headers.accept = "*/*";
	} else {
		headers.Accept = "*/*";
	}
	return window.fetch(entry.url, {method: "GET", headers: headers}).then(res => res.arrayBuffer()).then((buffer) => {
		const data = new Uint8Array(buffer);
		entry.tile = uint8ArrayToBase64(data);
		return buffer;
	});
}

function saveFromBinaryData(arrayOrBase64Data, fileName) {
	if (!(arrayOrBase64Data instanceof Uint8Array || ( typeof arrayOrBase64Data === "string" ))) {
		return;
	}
	const newBlob = arrayOrBase64Data instanceof Uint8Array ? new Blob([arrayOrBase64Data]) : new Blob([Uint8Array.from(atob(arrayOrBase64Data), c => c.charCodeAt(0))]);
	const data = window.URL.createObjectURL(newBlob);
	const link = document.createElement('a');
	link.href = data;
	link.download = fileName;
	link.click();
	window.URL.revokeObjectURL(data);
}

function toRow(div, entry) {
	div.entry = entry;
	div.setAttribute("role", "row");
	return div;
}

function toCell(div, cssClass) {
	div.setAttribute("role", "cell");

	if (cssClass) {
		div.classList.add(cssClass);
	}

	return div;
}

function findElementForEntry(entry) {
	const rowsNodeList = tilesTable.querySelectorAll('[role=row]');
	for (i = 0; i < rowsNodeList.length; i++) {
		const rowElement = rowsNodeList.item(i);
		if (rowElement.entry === entry) {
			return rowElement;
		}
	}
	return null;
}

function formatNumberLength(num, length) {
	let r = "" + num;
	while (r.length < length) {
		r = "0" + r;
	}
	return r;
}

function formatTime(dateString) {
	if (!dateString) {
		return "";
	}

	const date = new Date(dateString);
	return formatNumberLength(date.getUTCHours(), 2) + ":" + formatNumberLength(date.getUTCMinutes(), 2) + ":" + formatNumberLength(date.getUTCSeconds(), 2) + "." + formatNumberLength(date.getUTCMilliseconds(), 3);
}

window.onPendingEntry = function (entry) {
	doAutoscrollableOperation(() => {
		processPendingEntry(entry);
	})
};

window.onFinishedEntry = function (entry) {
	doAutoscrollableOperation(() => {
		processFinishedEntry(entry);
	})
};

window.onRemovedEntry = function (entry) {
	doAutoscrollableOperation(() => {
		processRemovedEntry(entry);
	})
};

window.redrawEntries = function (entries) {
	doAutoscrollableOperation(() => {
		tilesTable.querySelectorAll('[role=row]')
			.forEach((row) => row.remove());
		entries.forEach((entry) => {
			processPendingEntry(entry);
			if (entry.status !== -1/*pending*/) {
				processFinishedEntry(entry);
			}
		})
	})
};

function processPendingEntry(entry) {
	let rowNode, statusNode, urlNode, layersCountNode;

	tilesTable.appendChild(rowNode = toRow(document.createElement("div"), entry));
	rowNode.appendChild(statusNode = toCell(document.createElement("div"), 'status'));
	rowNode.appendChild(urlNode = toCell(document.createElement("div"), 'url'));
	rowNode.appendChild(layersCountNode = toCell(document.createElement("div"), 'layers'));

	statusNode.textContent = entry.status;
	urlNode.appendChild(toMvtLink(entry));
	rowNode.classList.add("pending-tile");
}

function processFinishedEntry(entry) {
	const rowNode = findElementForEntry(entry);
	if (!rowNode) {
		return;
	}
	const statusNode = rowNode.children[0];
	const layersCountNode = rowNode.children[2];

	statusNode.textContent = entry.status;

	rowNode.classList.remove("pending-tile");

	if (entry.extra.isValid) {
		const statistics = entry.statistics;
		if (statistics) {
			if (entry.extra.isEmpty || !statistics.featuresCount) {
				rowNode.classList.add("empty-tile");
			}

			layersCountNode.textContent = statistics.layersCount ? String(statistics.layersCount) : ""
		}

	}
	else {
		rowNode.classList.add("no-success-tile");
	}
}

function processRemovedEntry(entry) {
	const rowNode = findElementForEntry(entry);
	if (!rowNode) {
		return;
	}
	rowNode.remove();
}

function isNeedToScroll(scrollableElement) {
	return Math.abs(scrollableElement.offsetHeight + scrollableElement.scrollTop - scrollableElement.scrollHeight) < 5;
}

function doAutoscrollableOperation(operation) {
	const needToScroll = selectedRow || isNeedToScroll(tilesTable);
	operation && operation();

	let scrollToRow = selectedRow || (tilesTable.lastChild);

	if (needToScroll && scrollToRow && scrollToRow.firstChild && scrollToRow.firstChild.scrollIntoView) {
		scrollToRow.firstChild.scrollIntoView({block: 'nearest'});
	}
}