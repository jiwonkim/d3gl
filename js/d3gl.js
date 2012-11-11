// Jiwon Kim and Dan Posch
// {jiwonk, dcposch}@cs.stanford.edu
// CS448B Final Project

// See README.md for examples.


if(!d3 || !jQuery || !THREE || !requestAnimationFrame){
    throw "D3GL requires D3, JQuery, ThreeJS, and RequestAnimationFrame";
}

d3.gl = {};
d3.gl.globe = function(){
    // viewport dimensions, in pixels
    var width = 500;
    var height = 500;
    // texture name
    var texture = 'continentoutlines';
    // callbacks. data => lat, lon, etc
    var fnLat, fnLon;
    // make a closure. see http://bost.ocks.org/mike/chart/
    function globe(g){
        // TODO: render a globe
        console.log("Rendering. "+
            "Dimensions: "+width+","+height+" "+
            "Texture: "+texture);
        
    }
    globe.width = function(val){
        if(!arguments.length) return width;
        width = val;
        return globe;
    }
    globe.height = function(val){
        if(!arguments.length) return height;
        height = val;
        return globe;
    }
    globe.latitude= function(val){
        if(!arguments.length) return fnLat;  
        if(typeof val === "function") fnLat = val;
        else fnLat = function(){return val;}
        return globe;
    }
    globe.longitude= function(val){
        if(!arguments.length) return fnLon;  
        if(typeof val === "function") fnLon = val;
        else fnLon = function(){return val;}
        return globe;
    }
    globe.texture = function(val){
        if(!arguments.length) return texture;  
        texture = val;
        return globe;
    }
    return globe;
};
