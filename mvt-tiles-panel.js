const tilesTable = document.getElementById('tilesTable');
const viewTileContainer = document.getElementById('viewTileContainer');

const dialog = document.getElementById('viewTileDialog');
const closeButton = document.getElementsByClassName("viewTileDialog_closeButton")[0];
closeButton.onclick = function () {
	dialog.style.display = "none";
};

document.addEventListener("click", onDocumentClick);
document.getElementById('clear').addEventListener("click", (e) => {
	if (window.onClear) {
		window.onClear();
	}
	e.preventDefault();
	return false;
});


const trackEmptyResponseCheckBox = document.getElementById('trackEmptyResponse');
const trackOnlySuccessfulResponseCheckBox = document.getElementById('trackOnlySuccessfulResponse');
const mvtRequestPatternText = document.getElementById('mvtRequestPattern');

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
	if (dialogIsHidden) {
		let node = e.target;
		while (node && node.role !== "row" && node.parentElement !== tilesTable) {
			node = node.parentElement;
		}
		viewTileContainer.innerHTML = "";
		dialog.style.display = "none";
		if (node && node.entry) {
			setTimeout(() => {
				prepareGeoJsonTile(node.entry, (geoJsonOrJsonError) => {
					dialog.style.display = "block";
					viewTileContainer.innerHTML = createViewContent(node.entry, geoJsonOrJsonError);
				});
			}, 0)/*to see that previous content is cleared*/;
		}
	}
	else {
		if (e.target === dialog) {
			viewTileContainer.innerHTML = "";
			dialog.style.display = "none";
		}
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

function createViewContent(entry, geoJsonOrJsonError) {
	const result = JSON.stringify(
		entry,
		(key, value) => {
			if (key === 'extra') {
				return undefined;
			}
			else if (key === 'tile') {
				return geoJsonOrJsonError;
			}
			return value;
		},
		2
	);
	return result;
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

function toCell(div) {
	div.setAttribute("role", "cell");
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

function isNeedToScroll(scrollableElement) {
	return Math.abs(scrollableElement.offsetHeight + scrollableElement.scrollTop - scrollableElement.scrollHeight) < 5;
}

window.onPendingEntry = function (entry) {
	doAutoscroollableOperation(() => {
		processPendingEntry(entry);
	})
};

window.onFinishedEntry = function (entry) {
	doAutoscroollableOperation(() => {
		processFinishedEntry(entry);
	})
};

window.onRemovedEntry = function (entry) {
	doAutoscroollableOperation(() => {
		processRemovedEntry(entry);
	})
};

window.redrawEntries = function (entries) {
	doAutoscroollableOperation(() => {
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
	let rowNode, statusNode, urlNode, bytesNode, xNode, yNode, zNode, layersCountNode, featuresCountNode, startDateNode,
		durationNode, nEndedNode;

	tilesTable.appendChild(rowNode = toRow(document.createElement("div"), entry));
	rowNode.appendChild(statusNode = toCell(document.createElement("div")));
	rowNode.appendChild(zNode = toCell(document.createElement("div")));
	rowNode.appendChild(xNode = toCell(document.createElement("div")));
	rowNode.appendChild(yNode = toCell(document.createElement("div")));
	rowNode.appendChild(bytesNode = toCell(document.createElement("div")));
	rowNode.appendChild(urlNode = toCell(document.createElement("div")));
	rowNode.appendChild(layersCountNode = toCell(document.createElement("div")));
	rowNode.appendChild(featuresCountNode = toCell(document.createElement("div")));
	rowNode.appendChild(startDateNode = toCell(document.createElement("div")));
	rowNode.appendChild(nEndedNode = toCell(document.createElement("div")));
	rowNode.appendChild(durationNode = toCell(document.createElement("div")));

	statusNode.textContent = entry.status;
	urlNode.appendChild(toMvtLink(entry));
	zNode.textContent = String(entry.z);
	xNode.textContent = String(entry.x);
	yNode.textContent = String(entry.y);
	startDateNode.textContent = String(entry.startOrder) + " | " + formatTime(entry.startedDateTime);
	durationNode.textContent = String(entry.time ? window.prettyMilliseconds(Math.round(entry.time)) : "");
	nEndedNode.textContent = String(entry.endOrder || "");

	featuresCountNode.classList.add("wrap-content");
	rowNode.classList.add("pending-tile");
}

function processFinishedEntry(entry) {
	const rowNode = findElementForEntry(entry);
	if (!rowNode) {
		return;
	}
	const statusNode = rowNode.children[0];
	const bytesNode = rowNode.children[4];
	const layersCountNode = rowNode.children[6];
	const featuresCountNode = rowNode.children[7];
	const nEndedNode = rowNode.children[9];
	const durationNode = rowNode.children[10];

	statusNode.textContent = entry.status;
	bytesNode.textContent = String(entry.tileSize ? window.formatBytes(entry.tileSize) : "");
	nEndedNode.textContent = String(entry.endOrder || "");

	rowNode.classList.remove("pending-tile");

	if (entry.extra.isValid) {
		const statistics = entry.statistics;
		if (statistics) {
			if (entry.extra.isEmpty || !statistics.featuresCount) {
				rowNode.classList.add("empty-tile");
			}

			layersCountNode.textContent = statistics.layersCount ? String(statistics.layersCount) : ""

			const layersStatistics = statistics.byLayers;
			featuresCountNode.textContent = Object.keys(layersStatistics).map(
				(layerName) => layerName + ": " + layersStatistics[layerName].featuresCount
			).join("\n")
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

function doAutoscroollableOperation(operation) {
	const needToScroll = isNeedToScroll(tilesTable);
	operation();
	if (needToScroll && tilesTable.lastChild) {
		const lastRow = tilesTable.lastChild;
		if (lastRow && lastRow.firstChild && lastRow.firstChild.scrollIntoView) {
			lastRow.firstChild.scrollIntoView();
		}
	}
}