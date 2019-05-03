var links = document.getElementsByTagName("a");
for (i = 0; i < links.length; i++) {
   var link = links[i];
   link.addEventListener('click', (function(){
       chrome.tabs.create({url: this.getAttribute('href')});
       return false;
   }).bind(link)); 
}

