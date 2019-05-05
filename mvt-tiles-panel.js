var tilesTable = document.getElementById('tilesTable');
var viewTileContainer = document.getElementById('viewTileContainer');

var dialog = document.getElementById('viewTileDialog');
var closeButton = document.getElementsByClassName("viewTileDialog_closeButton")[0];
closeButton.onclick = function() {
  dialog.style.display = "none";
}

document.addEventListener("click", onDocumentClick);
document.getElementById('clear').addEventListener("click", (e)=>{
    if(window.onClear){
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

function createViewContent(entry){
    /*{
        x: entry.x,
        y: entry.y,
        z: entry.z,,
        status: entry.status,
        headers: entry.headers,
        
        
    }*/
    return JSON.stringify(
          entry, 
          (key, value)=>{
              if (key == 'tile') {
                 var data = Uint8Array.from(atob(entry.tile), c => c.charCodeAt(0));
                 if(!data.length){
                     return {};
                 }
                 var tile = new VectorTile.VectorTile(new Pbf(data));
                 var layerNames = Object.keys(tile.layers);
                 if(!layerNames.length) {
                     return {};
                 }          
                 var geoJsonLayers = {};
                 layerNames.forEach((layerName)=>{
                   var geoJsonLayer = geoJsonLayers[layerName] = {};
                   var geoJsonFeatures = geoJsonLayer.features = [];
                   var layer = tile.layers[layerName];
                   for(var i = 0; i < layer.length; i++)
                   {
                      geoJsonFeatures.push(layer.feature(i).toGeoJSON(entry.x, entry.y, entry.z));
                   }
                 })
                 return geoJsonLayers;
              }
              return value;
        }, 
        2
    );
}

const adjustInputTextWidth = (input)=>{
     var style = window.getComputedStyle(input) 
     var textWidth = getTextWidth(input.value, style.fontSize, style.fontFamily, style.fontWeight);
     input.style.width = (textWidth + 20)+"px";
}

const updateControls = (trackEmptyResponse, trackOnlySuccessfulResponse, mvtRequestPattern)=>{
  trackEmptyResponseCheckBox.checked = !!trackEmptyResponse;
  trackOnlySuccessfulResponseCheckBox.checked = !!trackOnlySuccessfulResponse;
  mvtRequestPatternText.value = mvtRequestPattern;
  adjustInputTextWidth(mvtRequestPatternText);
};

const updateSettings = ()=>{
  chrome.storage.local.set({
        trackEmptyResponse: trackEmptyResponseCheckBox.checked,
        trackOnlySuccessfulResponse: trackOnlySuccessfulResponseCheckBox.checked,
        mvtRequestPattern: mvtRequestPatternText.value
      }, function() {}
  )  
};

chrome.storage.local.get(['trackEmptyResponse', 'trackOnlySuccessfulResponse', 'mvtRequestPattern'], function({trackEmptyResponse, trackOnlySuccessfulResponse, mvtRequestPattern}) {
  updateControls(trackEmptyResponse, trackOnlySuccessfulResponse, mvtRequestPattern);
});

chrome.storage.local.onChanged.addListener(function(changes){
    if(changes['trackEmptyResponse']){
        trackEmptyResponseCheckBox.checked = !!changes['trackEmptyResponse'].newValue;
    }
    if(changes['trackOnlySuccessfulResponse']){
        trackOnlySuccessfulResponseCheckBox.checked = !!changes['trackOnlySuccessfulResponse'].newValue;
    }
    if(changes['mvtRequestPattern']){
        mvtRequestPatternText.value = changes['mvtRequestPattern'].newValue;   
    }
});

trackEmptyResponseCheckBox.addEventListener('change', updateSettings);
trackOnlySuccessfulResponseCheckBox.addEventListener('change', updateSettings);
mvtRequestPatternText.addEventListener('keyup', ()=>{
     adjustInputTextWidth(mvtRequestPatternText);
     updateSettings();
});
 

function onDocumentClick(e){
    var dialogIsHidden = window.getComputedStyle(dialog,null).getPropertyValue("display") == "none";
    if(dialogIsHidden){
        var node = e.target;
        while (node && node.role != "row" && node.parentElement != tilesTable) {
            node = node.parentElement;
        }  
        viewTileContainer.innerHTML = "";
        dialog.style.display = "none";
        if(node && node.entry) {
            setTimeout(()=>{
                var viewConent = createViewContent(node.entry);
                dialog.style.display = "block";
                viewTileContainer.innerHTML = viewConent;    
            }, 0)/*to see that previous content is cleared*/;
        } 
    }
    else {
        if(e.target == dialog){
           viewTileContainer.innerHTML = "";
           dialog.style.display = "none"; 
        }
    }
    e.stopPropagation();
}

function toRow(div, entry){
    div.entry = entry;
    div.setAttribute("role", "row");
    return div;
}

function toCell(div){
    div.setAttribute("role", "cell");
    return div;
}

function toMvtLink(entry){
    var requestUrl = entry.url;;
    var requestHeaders = entry.headers;  
    
    var url = new URL(requestUrl);
    var aText = url.pathname+url.search+url.hash;
    var a = document.createElement("a");
    a.setAttribute("href", requestUrl);
    a.addEventListener('click', function(e){
      var newBlob = new Blob([Uint8Array.from(atob(entry.tile), c => c.charCodeAt(0))]);
      const data = window.URL.createObjectURL(newBlob);
      var link = document.createElement('a');
      link.href = data;
      link.download = entry.z + "_" + entry.x + "_" + entry.y + ".mvt";
      link.click();
      window.URL.revokeObjectURL(data);
       e.preventDefault(); 
       e.stopPropagation();
       return false;
    }); 
    a.textContent = aText;
    return a;
}

function formatNumberLength(num, length) {
    var r = "" + num;
    while (r.length < length) {
        r = "0" + r;
    }
    return r;
}

function tormatTime(dateString){
    if(!dateString)
    {
        return "";
    }
        
    var date= new Date(dateString);
    return formatNumberLength(date.getUTCHours(),2)+":"+formatNumberLength(date.getUTCMinutes(), 2)+":"+formatNumberLength(date.getUTCSeconds(),2)+"."+formatNumberLength(date.getUTCMilliseconds(),3);
}

function isNeedToScroll(scrollableElement){
    return Math.abs(scrollableElement.offsetHeight + scrollableElement.scrollTop -  scrollableElement.scrollHeight) < 5;
}


window.redrawEntries = function(entries){
    var needToScroll = isNeedToScroll(tilesTable);
    
    var cells = tilesTable.querySelectorAll('[role=cell]');
    cells.forEach((cell)=>{
        cell.remove();
    });

    entries.forEach((entry)=>{
        var rowNode, statusNode, urlNode, xNode, yNode, zNode, layersCountNode, featuresCountNode, startDateNode, durationNode, nEndedNode;

        tilesTable.appendChild(rowNode = toRow(document.createElement("div"), entry));
        rowNode.appendChild(statusNode = toCell(document.createElement("div")));
        rowNode.appendChild(zNode = toCell(document.createElement("div")));
        rowNode.appendChild(xNode = toCell(document.createElement("div")));
        rowNode.appendChild(yNode = toCell(document.createElement("div")));
        rowNode.appendChild(urlNode = toCell(document.createElement("div")));        
        rowNode.appendChild(layersCountNode = toCell(document.createElement("div")));
        rowNode.appendChild(featuresCountNode = toCell(document.createElement("div")));
        rowNode.appendChild(startDateNode = toCell(document.createElement("div")));
        rowNode.appendChild(nEndedNode = toCell(document.createElement("div")));
        rowNode.appendChild(durationNode = toCell(document.createElement("div")));
        
        layersCountNode.classList.add("wrap-content");
        featuresCountNode.classList.add("wrap-content");

        statusNode.textContent = entry.status;
        
        urlNode.appendChild(toMvtLink(entry));
        zNode.textContent = String(entry.z);
        xNode.textContent = String(entry.x);
        yNode.textContent = String(entry.y);
        
        startDateNode.textContent = String(entry.startOrder) + " | " + tormatTime(entry.startedDateTime);
        durationNode.textContent = String(entry.time ? Math.round(entry.time) : "");
        nEndedNode.textContent = String(entry.endOrder || "");

        
        var isPending = entry.status == -1;
        var isOk = entry.status == 200;
        var isNoContent = entry.status == 204;
        var isSuccess = isOk || isNoContent;
        
        if(isPending)
        {
            rowNode.classList.add("pending-tile");
        } 
        else if(!isSuccess)
        {
             rowNode.classList.add("no-success-tile");
        }
        else {
            var statistics = entry.statistics;
            if(statistics)
            {
                if(isNoContent || !statistics.featuresCount)
                {
                    rowNode.classList.add("empty-tile");
                }
                layersCountNode.textContent = statistics.featuresCount ? String(statistics.featuresCount) : ""
                var layersStatistics = statistics.byLayers;
                featuresCountNode.textContent = Object.keys(layersStatistics).map(
                   (layerName) => layerName + ": " + layersStatistics[layerName].featuresCount
                ).join("\n")                      
            }
        }
    })
    
    if(needToScroll && tilesTable.lastChild)
    {
        var lastRow = tilesTable.lastChild;
        if(lastRow && lastRow.firstChild && lastRow.firstChild.scrollIntoView){
            lastRow.firstChild.scrollIntoView();
        }
    }
}