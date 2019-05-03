var tilesTable = document.getElementById('tilesTable');
var viewTileContainer = document.getElementById('viewTileContainer');

var dialog = document.getElementById('viewTileDialog');
var closeButton = document.getElementsByClassName("viewTileDialog_closeButton")[0];
closeButton.onclick = function() {
  dialog.style.display = "none";
}

document.addEventListener("click", onDocumentClick, true);
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
                var viewConent = JSON.stringify(node.entry, null, 2);
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

function toMvtLink(textUrl){
    var url= new URL(textUrl);
    var aText = url.pathname+url.search+url.hash;
    var a = document.createElement("a");
    a.setAttribute("href", textUrl);
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
        
        urlNode.appendChild(toMvtLink(entry.url));
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
            var layersNames = Object.keys(entry.tile.layers);
            if(isNoContent || !layersNames.length)
            {
                rowNode.classList.add("empty-tile");
            }
            layersCountNode.textContent = String(layersNames.length)
            featuresCountNode.textContent = layersNames.map((layerName) => layerName + ": " + entry.tile.layers[layerName].features.length).join("\n")            
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