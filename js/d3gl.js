// Jiwon Kim and Dan Posch
// {jiwonk, dcposch}@cs.stanford.edu
// CS448B Final Project

// See README.md for examples.

// check prerequisites 
if(!d3 || !jQuery || !THREE || !requestAnimationFrame){
    throw "D3GL requires D3, JQuery, ThreeJS, and RequestAnimationFrame";
}

d3.gl = {};
d3.gl.globe = function(){
    // *** see PROPERTIES
    // viewport dimensions, in pixels
    var width = 400;
    var height = 400;
    // callbacks (globe-level. see shapes(), points(), etc)
    var fnTex, fnTransparency;
    // event handlers
    var eventHandlers = {
        /* mouse handlers */
        'mousedown':[],
        'mousemove':[],
        'mouseup':[],
        'click':[],
        'dblclick':[],

        /* fired before each render */
        'update':[]
    };

    // *** PRIVATE
    var zoom = 2.0, rotation = {"lat":0,"lon":0};
    // overlays. these are functions that either render onto the globe tex (eg colored countries),
    // or which run after the globe itself to draw additional 3D elements (eg arcs)
    var overlayTex = []; // function(context2d, datum)
    var overlay3D = []; // function(gl, datum)
    // animation
    var anim = {};
	// constants
	var VIEW_ANGLE = 45,
	    NEAR = 0.01,
	    FAR = 100;
    var MOUSE_SENSITIVITY = 0.15; // degrees rotated per pixel
    var ZOOM_SENSITIVITY = 0.1; // (0 = no effect, 1 = infinite)
    var MIN_ZOOM = 0.5, MAX_ZOOM = 4;
    var COUNTRY_CODE_TEX = "../img/shape-countries.png";

    // debug
    window.globe= globe;
    window.anim = anim;

    // *** HELPER FUNCTIONS
    function initMaterial(shaders, textures){
        var vertexShader = shaders[0];
        var fragmentShader = shaders[1];
        var uniforms = {
            texBase: {
                type: "t",
                value: textures.base
            },
            texShapes: {
                type: "t",
                value: textures.shapes
            },
            texOverlay: {
                type: "t",
                value: textures.overlay
            },
            transparency: {
                type: "f",
                value: 1.0      
            }
        };
        var material = new THREE.ShaderMaterial({
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            uniforms: uniforms,
            transparent: true,
            // no documentation on this at all. examples using doubleSided() are wrong. 
            // had to grub through the source.
            //depthTest: false,
            //side: THREE.DoubleSide,
            // the default (if you comment out the following lines) is SrcAlpha/OneMinusSrcAlpha, AddEquation
            blending: THREE.CustomBlending,
            blendSrc: THREE.SrcAlphaFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor,
            blendEquation: THREE.AddEquation
        });

        return material;
    };
    var choroplethUtils = {
        loadCountryCodeTexture: function(callback) {
            var codes = new Image();
            codes.onload = callback;
            codes.src = COUNTRY_CODE_TEX;
        },
        countryCodeFromColor: function(r, g, b) {
            return r*255*255 + g*255 + b;
        },
        colorOverlayFromCountryCode: function(code) {
            if(code==840) return {r: 255, g: 0, b: 0};
            return {r: 0, g: 0, b: 0};
        },
        highlightCountryAt: function(gl, lat, lon) {
            var x, y;
            x = Math.floor(this.codes.width * (lon + 180)/360);
            y = this.codes.height - 
                Math.floor(this.codes.height * (lat + 90)/180);

            var idx, r, g, b;
            idx = (y*this.codes.width + x)*4;
            r = this.codesImageData.data[idx];
            g = this.codesImageData.data[idx + 1];
            b = this.codesImageData.data[idx + 2];

            var countryCode = this.countryCodeFromColor(r, g, b);
            gl.uniforms.country.value = countryCode;
        },
        storeCountryCodesImageData: function(context, pixels) {
            context.putImageData(pixels, 0, 0);
            choroplethUtils.codesImageData = context.getImageData(
                0, 0, choroplethUtils.codes.width, choroplethUtils.codes.height);
        },
        createChoroplethTexture: function() {
            // create hidden canvas element for image pixel manipulation
            var canvas = document.createElement("canvas");
            canvas.width = this.codes.width;
            canvas.height = this.codes.height;

            var context = canvas.getContext("2d"); 
            context.drawImage(this.codes, 0, 0);
            var pixels = context.getImageData(0, 0, canvas.width, canvas.height);
            this.storeCountryCodesImageData(context, pixels);
            for (var y=0; y<canvas.height; y++) {
                for(var x=0; x<canvas.width; x++) {
                    var r, g, b, a;
                    var idx = (y*canvas.width + x)*4;

                    r = pixels.data[idx];
                    g = pixels.data[idx + 1];
                    b = pixels.data[idx + 2];
                    var countryCode = this.countryCodeFromColor(r, g, b);
                    var colorOverlay = this.colorOverlayFromCountryCode(countryCode);
                    pixels.data[idx] = colorOverlay.r;
                    pixels.data[idx + 1] = colorOverlay.g;
                    pixels.data[idx + 2] = colorOverlay.b;
                }
            }
            context.putImageData(pixels, 0, 0);

            // turn it into a texture
            var texture = new THREE.Texture(canvas);
            texture.needsUpdate = true;
            return texture;
        },
        createMaterial: function(tex) {
            var material = colorOverlayUtils.createMaterial(
                tex,
                this.createChoroplethTexture(),
                {
                    codes: {
                        type: "t",
                        value: THREE.ImageUtils.loadTexture(this.codes.src)
                    },
                    country: {
                        type: "i",
                        value: 0
                    },
                }
            );
            return material;
        },
    }

    function loadShaders(name, callback){
        var urls = [], shaders = [], loaded = 0;
        urls.push("../shaders/"+name+"_vs.glsl");
        urls.push("../shaders/"+name+"_fs.glsl");
        for(var i = 0; i < urls.length; i++){
            (function(){
                var j = i;
                $.get(urls[j], function(shader) {
                    shaders[j] = shader;
                    if(++loaded == urls.length) callback(shaders);
                });
            })();
        }
    }

    // sets up a ThreeJS globe
    function initGL(gl){
        var scene = new THREE.Scene();

        // camera
        var camera = new THREE.PerspectiveCamera(
            VIEW_ANGLE, width/height,
            NEAR, FAR);
        camera.position.z = 2;
        scene.add(camera);

        // globe model. rendering steps:
        // 1. render the base texture
        // 2. add any shape overlays using the shaders
        // 3. add additional overlays from an offscreen canvas (arbitrary d3)

        // create hidden canvas element for texture manipulation
        var canvas = document.createElement("canvas");
        canvas.width = 4000;
        canvas.height = 2000;
        gl.textures.overlay = new THREE.Texture(canvas);
        var sphereMaterial = initMaterial(gl.shaders, gl.textures);
        var sphereMaterialBack = initMaterial(gl.shaders, gl.textures);
        //sphereMaterial.depthTest = sphereMaterialBack.depthTest = false;
        //sphereMaterial.depthWrite = sphereMaterialBack.depthWrite = false;
        sphereMaterialBack.side = THREE.BackSide;

        // create the actual globe
        var radius = 1.0, segments = 80, rings = 40;
        var geom = new THREE.SphereGeometry(radius, segments, rings);
        var sphere = new THREE.Mesh(geom, sphereMaterial);
        var sphereBack = new THREE.Mesh(geom, sphereMaterialBack);
        scene.add(sphereBack);
        scene.add(sphere);
                
        // add a point light
        var pointLight = new THREE.PointLight( 0xFFFFFF );
        pointLight.position.x = 1;
        pointLight.position.y = 5;
        pointLight.position.z = 13;
        scene.add(pointLight);

        // start the renderer
        var renderer = new THREE.WebGLRenderer({
            antialias: true
        });
        renderer.setSize(width, height);

        if(!sphere || !canvas || !sphereMaterial.uniforms || !renderer || !scene || !camera){
            throw "Initialization failed.";
        }
        gl.meshes = [sphere,sphereBack];
        gl.overlayCanvas = canvas;
        gl.material = sphereMaterial;
        gl.uniforms = sphereMaterial.uniforms;
        gl.renderer = renderer;
        gl.scene = scene;
        gl.camera = camera;
        gl.projector = new THREE.Projector();
    }

    function initControls(gl, elem){
        var dragStart;
        var latlon = null;
        $(elem).mousedown(function(evt){
            fireMouseEvent("mousedown", gl, evt);
            evt.preventDefault();
            dragStart = [evt.pageX, evt.pageY];
        }).mousemove(function(evt){
            fireMouseEvent("mousemove", gl, evt);
            if(!dragStart) return;
            dragUpdate(evt);
            dragStart = [evt.pageX, evt.pageY]; 
        }).mouseup(function(evt){
            fireMouseEvent("mouseup", gl, evt);
            if(!dragStart) return;
            dragUpdate(evt);
            dragStart = null;
        }).mouseleave(function(evt){
            if(!dragStart) return;
            dragUpdate(evt);
            dragStart = null;
        }).click(function(evt){
            fireMouseEvent("click", gl, evt);
        }).dblclick(function(evt){
            fireMouseEvent("dblclick", gl, evt);
        }).mousewheel(function(evt, delta, dx, dy){
            zoom *= Math.pow(1-ZOOM_SENSITIVITY, dy);
            zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
            evt.preventDefault();
        });

        function dragUpdate(evt){
            rotation.lon -= (evt.pageX - dragStart[0])*MOUSE_SENSITIVITY*zoom;
            rotation.lat += (evt.pageY - dragStart[1])*MOUSE_SENSITIVITY*zoom;
        }
    }

    // This is not quite as clean as
    // an external stylesheet, but simpler for
    // the end user.
    function initStyle(elem){
        elem.style.cursor = "pointer";
    }

    /**
     * Turns a mouse event into a [lat, lon] pair,
     * or returns null if the mouse isn't over the globe.
     */
    function intersect(gl, evt) {
        // cast a ray through the mouse
        var vector = new THREE.Vector3(
            (evt.offsetX / width)*2 - 1,
            -(evt.offsetY / height)*2 + 1,
            1.0
        );
        gl.projector.unprojectVector(vector, gl.camera);
        var ray = new THREE.Ray(
            gl.camera.position,
            vector.subSelf(gl.camera.position).normalize()
        );

        // ray-sphere intersection for unit sphere centered at (0, 0, 0)
        var a = ray.direction.dot(ray.direction);
        var b = 2 * ray.origin.dot(ray.direction)
        var c = ray.origin.dot(ray.origin) - 1;
        var det = b*b - 4*a*c;
        if(det < 0) return null; // no intersection
        var t = (-b - Math.sqrt(det))/(2*a);
        var point = ray.direction.clone().multiplyScalar(t).addSelf(ray.origin);

        // convert to lat/lon
        var lat = Math.asin(point.y) + rotation.lat;
        var lon = Math.atan2(point.x, point.z) + rotation.lon;
        lat = 180/Math.PI*lat;
        lon = 180/Math.PI*lon - 90;
        while(lon < -180) lon += 360;
        while(lon > 180) lon -= 360;
        while(lat < -90) lat += 360;
        while(lat > 270) lat -= 360;
        if(lat > 90) lat = 90 - lat;
        return [lat, lon];
    }

    function fireMouseEvent(name, gl, evt){
        var handlers = eventHandlers[name];
        if (handlers.length == 0) return;
        evt.latlon = intersect(gl, evt);
        evt.datum = gl.datum;
        for(var i = 0; i < handlers.length; i++){
            handlers[i](evt);
        }
    }
    function fireEvent(name, evt) {
        var handlers = eventHandlers[name];
        if (handlers.length == 0) return;
        for(var i = 0; i < handlers.length; i++){
            handlers[i](evt);
        }
    }

    function updateAnimations(){
        var now = new Date().getTime();
        // rotate
        if(anim.rotation){
            var dt = now-anim.rotation.startTime;
            var duration = anim.rotation.duration;
            if(dt < 0){
                throw "wtf";
            } else if(dt > duration){
                // done
                rotation = anim.rotation.end;
                anim.rotation = null;
            } else {
                // in progress
                var ease = anim.rotation.easing || d3.ease("cubic-in-out");
                var t = ease(dt/duration);
                var dlat = anim.rotation.end.lat - anim.rotation.start.lat;
                var lat = anim.rotation.start.lat + dlat*t;
                var dlon = anim.rotation.end.lon - anim.rotation.start.lon;
                if(dlon < -180) dlon += 360;
                if(dlon > 180) dlon -= 360;
                var lon = (anim.rotation.start.lon + dlon*t + 180+360)%360 - 180;
                rotation = {"lat":lat, "lon":lon};
            }
        }
    }


    // *** RENDER FUNCTION
    // see http://bost.ocks.org/mike/chart/
    function globe(g){
        g.each(globeRender);
    }
    function globeRender(d,i){
        // validate 
        if(this.tagName == "canvas") throw "D3GL creates its own canvas elements. "+
            "Render into a <div>, not directly into a <canvas>."

        // gl stores all the rendering state for each individual globe.
        // remember that a call to d3.gl.globe() may result in multiple globes (one per datum)
        var gl = {};
        gl.element = this; // the D3 primitive: one dom element, one datum
        gl.datum = d;
        gl.index = i;
        gl.textures = {};
        // load shaders and textures, then start rendering
        var texUrl = fnTex(d);
        gl.textures.base = THREE.ImageUtils.loadTexture(texUrl, null, function(){
            gl.textures.shapes = THREE.ImageUtils.loadTexture("../img/transparent-tex.png", null, function(){
                loadShaders("color_overlay", function(shaders){
                    gl.shaders = shaders;
                    start();
                });
            });
        });

        function start() {
            // 3js state
            initGL(gl); // set up scene, transform, etc
            initControls(gl, gl.renderer.domElement); // mouse zoom+rotate
            initStyle(gl.renderer.domElement); // <canvas> style
            gl.element.appendChild(gl.renderer.domElement);
            
            // now render the 3D overlay
            for(var i = 0; i < overlay3D.length; i++) {
                overlay3D[i](gl, d);
            }
            
            // called 60 times per second
            function render(){
                // update
                fireEvent("update", null);
                updateAnimations();
                if(fnTransparency) gl.uniforms.transparency.value = fnTransparency(d);

                // draw the texture overlay
                var context = gl.overlayCanvas.getContext("2d");
                context.setTransform(1,0,0,1,0,0); // identity
                context.width = gl.overlayCanvas.width;
                context.height = gl.overlayCanvas.height;
                context.clearRect(0,0,context.width,context.height);
                for(var i = 0; i < overlayTex.length; i++){
                    overlayTex[i](context, d);
                }
                gl.textures.overlay.needsUpdate = true; // tell 3js to update
                
                // draw the globe
                for(var i = 0; i < gl.meshes.length; i++) {
                    gl.meshes[i].rotation.x = rotation.lat*Math.PI/180.0;
                    gl.meshes[i].rotation.y = -(rotation.lon+90)*Math.PI/180.0;
                }
                gl.camera.position.z = 1+zoom;
                gl.material.side = THREE.DoubleSide;
                gl.renderer.sortObjects = false;
                gl.renderer.sortElements = false;
                gl.renderer.render(gl.scene, gl.camera);

                requestAnimationFrame(render);
            }
            render();
        }
    }

    // *** PROPERTIES
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
        if(!arguments.length) return fnTex;  
        if(typeof val === "function") fnTex = val;
        else fnTex = function(){return val;}
        return globe;
    }
    globe.transparency = function(val){
        if(!arguments.length) return fnTransparency;  
        if(typeof val === "function") fnTransparency = val;
        else fnTransparency = function(){return val;}
        return globe;
    }
    globe.on = function(eventName, callback){
        if(typeof(eventHandlers[eventName])==="undefined"){
            throw "unsupported event "+eventName;
        }
        eventHandlers[eventName].push(callback);
    }
    globe.rotation = function(latlon){
        if(!arguments.length) return rotation;
        if(!latlon || !latlon.lat || !latlon.lon) throw "Invalid rotation()";
        rotation = latlon;
        return globe;
    }
    globe.zoom = function(z){
        if(!arguments.length) return zoom;
        if(!z || z<0) throw "Invalid zoom()";
        zoom = z;
        return globe;
    }

    // *** FUNCTIONS
    globe.rotateTo = function(latlon, ms){
        console.log("rotateTo(["+latlon.join(",")+"], "+ms+")");
        if(!ms) ms = 400; // same defaults as jquery
        else if(ms=="fast") ms = 200;
        else if(ms=="slow") ms = 600;

        anim.rotation = {
            start:rotation,
            end:{"lat":latlon[0],"lon":latlon[1]},
            startTime:new Date().getTime(),
            duration:ms
        };
    }


    /* Supported overlays:
     * * .shapes() -- color in shapes, such as countries
     * * .arcs() -- display arcs connecting points on the globe
     * * .points() -- display points, such as cities
     */
    globe.shapes = function(shapeObj){
        /*if(!shapeObj || !shapeObj.ids || !shapeObj.texture){
            throw "globe.shapes() called with an invalid argument. see docs.";
        }*/

        // shape arguments
        var data = []; // array or function returning array
        var color = "#ff0000"; // color or function


        function shapes(){
            // render shape overlay
        }
        shapes.data = function(val){
            if(!arguments.length) return data;
            data = val;
            return shapes;
        }
        shapes.color = function(val){
            if(!arguments.length) return color;
            color = val;
            return shapes;
        }
        shapes.on = function(eventName, callback){
            globe.on(eventName, function(evt){
                var latlon = evt.latlon;
                if(latlon == null) return;
                
                // find the shape that was intersected
                var x, y;
                x = Math.floor(this.codes.width * (latlon[1] + 180)/360);
                y = this.codes.height - 
                    Math.floor(this.codes.height * (latlon[0] + 90)/180);
                
                var idx, r, g, b;
                idx = (y*this.codes.width + x)*4;
                r = codesImageData.data[idx];
                g = codesImageData.data[idx + 1];
                b = codesImageData.data[idx + 2];

                evt.shapeId = shapeIdFromColor(r, g, b);
                callback(evt);
            });
        }

        // helper functions
        function shapeIdFromColor(r,g,b){
            // TODO
        }

        overlays.push(shapes);
        return shapes;
    }

    /* globe.points
     * * lat
     * * lon
     * * color
     * * radius 
     */
    globe.points = function(){
        var fnLat, fnLon, fnColor, fnRadius, fnData;
        function drawCircle(context, plat, plon, pradius, color){
            context.beginPath();
            context.arc(plon, plat, pradius, 0, 2*Math.PI, false);
            context.fillStyle = color;
            context.fill();
        }
        function points(context, datum){
            // render the points into a texture that goes on the globe
            var array = fnData(datum);
            array.forEach(function(elem){
                var lat = fnLat(elem);
                var lon = fnLon(elem);
                if(lat < -90 || lat > 90 || lon < -180 || lon > 180){
                    throw "invalid lat/lon: "+lat+","+lon;
                }
                var color = fnColor(elem);
                var radius = fnRadius(elem); // radius in degrees
                if(radius <= 0) return;
                var pradius = radius * context.width / 360.0;
                var plat = context.height * (1-(lat + 90)/180);
                var plon = context.width * (lon + 180)/360;

                // scale to mitigate projection distortion
                var xscale = 1 / (Math.cos(lat*Math.PI/180) + 0.01);
                plon /= xscale;
                context.save();
                context.scale(xscale, 1.0);
                // draw it twice if on the the int'l date line to avoid clipping
                if(plon < pradius){
                    drawCircle(context, plat, plon + context.width/xscale, pradius, color);
                } else if(plon > context.width/xscale-pradius){
                    drawCircle(context, plat, plon - context.width/xscale, pradius, color);
                }
                drawCircle(context, plat, plon, pradius, color);
                context.restore();
            });
        }

        points.latitude = function(val){
            if(arguments.length == 0) return fnLat;
            if(typeof val == "function") fnLat = val;
            else fnLat = function(){return val;};
            return points;
        }
        points.longitude = function(val){
            if(arguments.length == 0) return fnLon;
            if(typeof val == "function") fnLon = val;
            else fnLon = function(){return val;};
            return points;
        }
        points.color = function(val){
            if(arguments.length == 0) return fnColor;
            if(typeof val == "function") fnColor = val;
            else fnColor = function(){return val;};
            return points;
        }
        points.radius = function(val){
            if(arguments.length == 0) return fnRadius;
            if(typeof val == "function") fnRadius = val;
            else fnRadius = function(){return val;};
            return points;
        }
        points.data = function(val){
            if(arguments.length == 0) return fnData;
            if(typeof val == "function") fnData = val;
            else fnData = function(){return val;};
            return points;
        }
        points.on = function(eventName, callback){
            globe.on(eventName, function(evt){
                var latlon = evt.latlon;
                if(latlon == null) return;
                
                // find the point that was intersected
                evt.point = null;
                var data = fnData(evt.datum);
                var mind = null;
                for(var i = 0; i < data.length; i++){
                    var lat = fnLat(data[i], i);
                    var lon = fnLon(data[i], i);
                    var rad = fnRadius(data[i], i);
                    var dlat = lat - latlon[0];
                    var dlon = (lon - latlon[1]) * Math.cos(lat*Math.PI/180);
                    var d = Math.sqrt(dlat*dlat+dlon*dlon);
                    // within 4 degrees counts as a click
                    if(d > Math.max(4, rad+2)) continue;
                    if(!mind || (d < mind)){
                        mind = d;
                        evt.point = data[i];
                    }
                }
                callback(evt);
            });
        }

        overlayTex.push(points);
        return points;
    };

    globe.bars = function() {
        var fnLat, fnLon, fnColor, fnHeight, fnData;
        var barsFs, barsVs;
        function bars(gl, datum){
            // render the points into a texture that goes on the globe
            var array = fnData(datum);
            var linesGeo = new THREE.Geometry();
            var attributes = {
                customColor: {
                    type: "c",
                    value: []
                }
            };
            array.forEach(function(elem){
                var lat = Math.PI/180*fnLat(elem);
                var lon = Math.PI/180*(fnLon(elem) + 90);
                var color = fnColor(elem);
                var height = fnHeight(elem); // in units of globe radius
                var r = height > 1 ? 2 : 1 + height;
                var x, y, z;
                x = r*Math.cos(lat)*Math.sin(lon);
                y = r*Math.sin(lat);
                z = r*Math.cos(lat)*Math.cos(lon);

                linesGeo.vertices.push(
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(x,y,z)
                );

                var hex = "0x" + color.slice(1);
                attributes.customColor.value.push(new THREE.Color(hex))
                attributes.customColor.value.push(new THREE.Color(hex));
            });

            loadShaders("bars", addBars);
            
            function addBars(shaders) {
                var lineMaterial = new THREE.ShaderMaterial({
                    vertexShader: shaders[0],
                    fragmentShader: shaders[1],
                    attributes: attributes,
                });

                var line = new THREE.Line(linesGeo, lineMaterial);
                line.type = THREE.Lines;
                gl.scene.add(line);
                gl.meshes.push(line);
            }
        }

        bars.latitude = function(val){
            if(arguments.length == 0) return fnLat;
            if(typeof val == "function") fnLat = val;
            else fnLat = function(){return val;};
            return bars;
        }
        bars.longitude = function(val){
            if(arguments.length == 0) return fnLon;
            if(typeof val == "function") fnLon = val;
            else fnLon = function(){return val;};
            return bars;
        }
        bars.color = function(val){
            if(arguments.length == 0) return fnColor;
            if(typeof val == "function") fnColor = val;
            else fnColor = function(){return val;};
            return bars;
        }
        bars.height = function(val){
            if(arguments.length == 0) return fnHeight;
            if(typeof val == "function") fnHeight = val;
            else fnHeight = function(){return val;};
            return bars;
        }
        bars.data = function(val){
            if(arguments.length == 0) return fnData;
            if(typeof val == "function") fnData = val;
            else fnData = function(){return val;};
            return bars;
        }

        overlay3D.push(bars);
        return bars;
    };
    
    /*
     * Free-form painting onto the globe texture.
     */
    globe.paint = function(painter){
        overlayTex.push(painter);
        return globe;
    }

    return globe;
};
