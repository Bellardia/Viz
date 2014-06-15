importScripts('third-party/Three/Three.js');
importScripts('globe.js');

var DAT = new DAT.Globe({}, true), ab, index;

process = function() {
    if (ab instanceof ArrayBuffer && index !== undefined) {
        
        DAT.pointBufferParser(ab, index, function(data) {
            DAT.geometryBuilder(data, {}, function(params) {
                DAT.verticesToBuffer(params.basegeo.vertices, function(ab) {
                    setTimeout(function() {
                        postMessage(ab, [ab]);
                        self.close();
                    }, (index % DAT.opts.numWorkers) * Math.floor(params.basegeo.vertices.length/1000 * 2));
                });
            });
        });
    }
}

onmessage = function (event) {
    
    if (event.data instanceof ArrayBuffer) {
       ab = event.data;
       process();
       
    } else {
        index = event.data.index;
        process();
        
    }
};