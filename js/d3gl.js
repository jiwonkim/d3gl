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
    // atmosphere is turned off by default
    var fnAtmosphere = function(d) { return false; };
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
    var overlayTex = []; // function(gl, context2d, datum)
    var overlay3D = []; // function(gl, datum)
    var shaders = {}; // hardcoded strings, see bottom
    // animation
    var anim = {};

	// *** CONSTANTS
	var VIEW_ANGLE = 45,
	    NEAR = 0.01,
	    FAR = 100;
    var MOUSE_SENSITIVITY = 0.15; // degrees rotated per pixel
    var ZOOM_SENSITIVITY = 0.1; // (0 = no effect, 1 = infinite)
    var MIN_ZOOM = 0.5, MAX_ZOOM = 4;

    // *** HELPER FUNCTIONS
    function initMaterial(shaders, textures){
        var uniforms = {
            texBase: {
                type: "t",
                value: textures.base
            },
            texOverlay: {
                type: "t",
                value: textures.overlay
            },
            texShapes: {
                type: "t",
                value: 0 
            },
            texColorLookup: {
                type: "t",
                value: 0
            },
            lookupShapes: {
                type: "i",
                value: 0
            },
            transparency: {
                type: "f",
                value: 1.0      
            }
        };
        var material = new THREE.ShaderMaterial({
            vertexShader: shaders.vertex,
            fragmentShader: shaders.fragment,
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

    function initAtmosphereMaterial(gl) {
        var uniforms = {
           atmosphereFlag: {
               type: "i",
               value: gl.atmosphere ? 1 : 0
           },
           atmosphereColor: {
               type: "c",
               value: gl.atmosphere ? new THREE.Color('0x'+gl.atmosphere.slice(1)) : 0,
           }
        };
        var atmosphereMaterial = new THREE.ShaderMaterial({
            vertexShader: shaders.atmosphere.vertex,
            fragmentShader: shaders.atmosphere.fragment,
            uniforms: uniforms,
            transparent: true,
            side: THREE.BackSide
        });
        return atmosphereMaterial;
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
        //sphereMaterialBack.depthTest = false;
        //sphereMaterialBack.depthWrite = false;
        sphereMaterialBack.side = THREE.BackSide;

        // create the actual globe
        var radius = 1.0, segments = 80, rings = 40;
        var geom = new THREE.SphereGeometry(radius, segments, rings);
        var sphere = new THREE.Mesh(geom, sphereMaterial);
        var sphereBack = new THREE.Mesh(geom, sphereMaterialBack);
        sphere.orientation = new THREE.Vector3(0, 0, 0);
        sphereBack.orientation = new THREE.Vector3(0, 0, 0);
        scene.add(sphereBack);
        scene.add(sphere);

        // atmospheric effects
        var atmosphereMaterial = initAtmosphereMaterial(gl);
        var atmosphere = new THREE.Mesh(geom, atmosphereMaterial);
        atmosphere.scale.x = 1.1;
        atmosphere.scale.y = 1.1;
        atmosphere.scale.z = 1.1;
        scene.add(atmosphere);

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
        gl.meshes = {
            globe: [sphere,sphereBack],
            bars: [],
            arcs: []
        };
        gl.overlayCanvas = canvas;
        gl.material = sphereMaterial;
        gl.uniforms = sphereMaterial.uniforms;
        gl.renderer = renderer;
        gl.scene = scene;
        gl.camera = camera;
        gl.projector = new THREE.Projector();
        window.gl = gl;
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
            zoomUpdate(Math.pow(1-ZOOM_SENSITIVITY, dy));
            evt.preventDefault();
        });

        $(document).keydown(function(evt){
            var key = String.fromCharCode(evt.which).toLowerCase();
            if(key=="w") zoomUpdate(1/1.2); // zoom in
            else if(key=="s") zoomUpdate(1.2); // zoom out
            else if(key=="a") rotation.lon -= 10;
            else if(key=="d") rotation.lon += 10;
            else return;
            evt.preventDefault();
        });

        function zoomUpdate(z){
            zoom *= z;
            zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
        }
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
        var rlat = rotation.lat*Math.PI/180;
        var rlon = rotation.lon*Math.PI/180;
        var rot = new THREE.Matrix4();
        rot.rotateY(rlon);
        rot.rotateX(-rlat);
        point = rot.multiplyVector3(point);
        var lat = Math.asin(point.y);
        var lon = Math.atan2(point.x, point.z);
        lat = 180/Math.PI*lat;
        lon = 180/Math.PI*lon - 90;
        while(lon < -180) lon += 360;
        while(lon > 180) lon -= 360;
        while(lat < -90) lat += 360;
        while(lat > 270) lat -= 360;
        if(lat > 90) lat = 180 - lat;
        if(lat < -90 || lat > 90 || lon < -180 || lon > 180) throw "lat/lon error "+lat+"/"+lon;
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
        gl.shaders = shaders.globe;
        gl.textures = {};

        // load textures
        console.log("loading textures");
        var canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        var texUrl = fnTex(d);
        gl.textures.base = THREE.ImageUtils.loadTexture(texUrl, null, function(){
            console.log("textures loaded");
            start();
        });
        gl.atmosphere = fnAtmosphere(d);

        function start() {
            // 3js state
            initGL(gl); // set up scene, transform, etc
            initControls(gl, gl.renderer.domElement); // mouse zoom+rotate
            initStyle(gl.renderer.domElement); // <canvas> style
            gl.element.appendChild(gl.renderer.domElement);
            
            // called 60 times per second
            function render(){
                // update
                fireEvent("update", null);
                updateAnimations();
                if(fnTransparency) gl.uniforms.transparency.value = fnTransparency(d);
                // now update/create the 3D overlays
                for(var i = 0; i < overlay3D.length; i++) {
                    overlay3D[i](gl, d);
                }
            
                // draw the 2D (texture) overlays
                var context = gl.overlayCanvas.getContext("2d");
                context.setTransform(1,0,0,1,0,0); // identity
                context.width = gl.overlayCanvas.width;
                context.height = gl.overlayCanvas.height;
                context.clearRect(0,0,context.width,context.height);
                for(var i = 0; i < overlayTex.length; i++){
                    overlayTex[i](gl, context, d);
                }
                gl.textures.overlay.needsUpdate = true; // tell 3js to update
                
                // draw the objects in scene
                Object.keys(gl.meshes).forEach(function(key) {
                    var meshes = gl.meshes[key];
                    meshes.forEach(function(m) {
                        m.matrixAutoUpdate = false;
                        m.matrixWorld = new THREE.Matrix4();
                        m.matrixWorld.rotateX(rotation.lat*Math.PI/180);
                        m.matrixWorld.rotateY(-rotation.lon*Math.PI/180);
                        m.matrixWorld.rotateY(m.orientation.y);
                        m.matrixWorld.rotateX(m.orientation.x);
                    });
                });
                /*
                for(var i = 0; i < gl.meshes.length; i++) {
                    var m = gl.meshes[i];
                }
                */
                gl.camera.position.z = 1+zoom;
                //gl.scene.overrideMaterial = true;
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
    globe.atmosphere = function(val) {
        if(!arguments.length) return fnAtmosphere;
        if(typeof val === "function") fnAtmosphere = val;
        else fnAtmosphere = function(){return val;}
        return globe;
    }
    globe.on = function(eventName, callback){
        if(typeof(eventHandlers[eventName])==="undefined"){
            throw "unsupported event "+eventName;
        }
        eventHandlers[eventName].push(callback);
        return globe;
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
            end:{"lat":latlon[0],"lon":latlon[1] + 90},
            startTime:new Date().getTime(),
            duration:ms
        };
    }


    /* Supported overlays:
     * * .shapes() -- color in shapes, such as countries
     * * .arcs() -- display arcs connecting points on the globe
     * * .points() -- display points, such as cities
     * 
     * globe.shapes(url) takes a url to a color-coded map overlay
     * or a predefined, built-in image. currently supported:
     * * "countries"
     *
     * The color-coded maps require a specific format. All datums
     * must have integer ids between 000 and 999. The color for
     * id ijk (base 10) is rgb(i*25.5, j*25.5, k*25.5)
     */
    globe.shapes = function(idMapUrl){
        var fnData = function(d){return d;};
        var fnColor, fnId;

        // builtins
        if(idMapUrl=="countries") idMapUrl = "http://dcpos.ch/d3gl/img/country-codes.png";

        // ImageData object for idMapUrl
        var idMapImageData = null;
        function shapes(gl, context, datum){
            gl.uniforms.lookupShapes.value = 1;

            // load id map texture
            if(!idMapUrl) throw "The id map for shapes has not been defined.";
            if(gl.uniforms.texShapes.value==0) {
                // If in the process of loading, set flag so that texture won't load again
                gl.uniforms.texShapes.value = 1;
                loadIdMap(gl);
            }

            // iterate over data elements and create data texture
            var array = fnData(datum);
            var textureHeight = 1;
            var textureWidth = 1024*3;
            var colorLookup = new Uint8Array(textureWidth*4);
            for (var i = 0; i < array.length; i++) {
                var id = fnId(array[i]);
                var idx = id*4*3;
                var color = fnColor(array[i]);
                if(color.length<4) throw "Color function for shapes "+
                    "does not return color of valid format [r, g, b, a]";
                for (var j = 0; j < 3; j++) {
                    colorLookup[idx + j*4] = color[0]; // r
                    colorLookup[idx + j*4 + 1] = color[1]; // g
                    colorLookup[idx + j*4 + 2] = color[2]; // b
                    colorLookup[idx + j*4 + 3] = color[3]; // a
                }
            }
            
            // pass in data texture as uniform
            gl.uniforms.texColorLookup.value = new THREE.DataTexture(
                colorLookup, textureWidth, textureHeight, THREE.RGBAFormat);
            gl.uniforms.texColorLookup.value.needsUpdate = true;
        }

        function loadIdMap(gl) {
            var map = new Image();
            map.crossOrigin = '';
            map.src = idMapUrl;
            map.onload = function() {
                // set the image data, for lookups (eg selection)
                var idCanvas = document.createElement("canvas");
                idCanvas.width = map.width;
                idCanvas.height = map.height;
                var idContext = idCanvas.getContext("2d");
                idContext.drawImage(map, 0, 0);
                idMapImageData = idContext.getImageData(0, 0,
                    idCanvas.width, idCanvas.height);

                // set the texture
                gl.uniforms.texShapes.value = new THREE.Texture();
                gl.uniforms.texShapes.value.image = map;
                gl.uniforms.texShapes.value.needsUpdate = true;
            }
        }

        shapes.data = function(val){
            if(arguments.length == 0) return fnData;
            if(typeof val == "function") fnData = val;
            else fnData = function(){return val;};
            return shapes;
        }
        shapes.map = function(val) {
            if(arguments.length == 0) return fnMap;
            if(typeof val == "function") fnMap = val;
            else fnMap = function(){return val;};
            return shapes;
        }
        // Shape id has to in the range [0, 999]
        shapes.id = function(val){
            if(arguments.length == 0) return fnId;
            if(typeof val == "function") fnId = val;
            else fnId = function(){return val;};
            return shapes;
        }
        shapes.color = function(val){
            if(arguments.length == 0) return fnColor;
            if(typeof val == "function") fnColor = val;
            else fnColor = function(){return val;};
            return shapes;
        }
        shapes.on = function(eventName, callback){
            globe.on(eventName, function(evt){
                if(!idMapImageData) return;

                var data = fnData(evt.datum);
                var latlon = evt.latlon;
                if(latlon == null) return;
                
                // find the shape that was intersected
                var x, y;
                x = Math.floor(idMapImageData.width * (latlon[1] + 180)/360);
                y = idMapImageData.height - 
                    Math.floor(idMapImageData.height * (latlon[0] + 90)/180);
                
                var idx, r, g, b;
                idx = (y*idMapImageData.width + x)*4;
                r = idMapImageData.data[idx];
                g = idMapImageData.data[idx + 1];
                b = idMapImageData.data[idx + 2];

                var shapeId = shapeIdFromColor(r, g, b);
                for(var i=0; i<data.length; i++) {
                    if(fnId(data[i])==shapeId) {
                        evt.shape = data[i];
                        break;
                    }
                }

                callback(evt);
            });
            
            function shapeIdFromColor(r, g, b) {
                var dr = Math.floor((r/25.5)+0.5);
                var dg = Math.floor((g/25.5)+0.5);
                var db = Math.floor((b/25.5)+0.5);
                return dr*10*10 + dg*10 + db;
            }

            return shapes;
        }

        overlayTex.push(shapes);
        return shapes;
    }

    /* globe.points
     * * lat
     * * lon
     * * color
     * * radius 
     */
    globe.points = function(){
        var fnData = function(d){return d;};
        var fnLat, fnLon, fnColor, fnRadius;
        var fnStrokeColor = function(){return "#000";};
        var fnLineWidth = function(){return 0;}; // default = no stroke
        function drawCircle(context, plat, plon, pradius, color, strokeColor, lineWidth){
            context.beginPath();
            context.arc(plon, plat, pradius, 0, 2*Math.PI, false);
            context.fillStyle = color;
            context.fill();
            context.strokeStyle = strokeColor;
            context.lineWidth = lineWidth;
            context.stroke();
        }
        function points(gl, context, datum){
            // render the points into a texture that goes on the globe
            var array = fnData(datum);
            for(var i=0; i<array.length; i++) {
                var elem = array[i];
                var lat = parseFloat(fnLat(elem, i));
                var lon = parseFloat(fnLon(elem, i));
                if(lat < -90 || lat > 90 || lon < -180 || lon > 180){
                    throw "invalid lat/lon: "+lat+","+lon;
                }
                var color = fnColor(elem, i);
                var strokeColor = fnStrokeColor(elem, i);
                var lineWidth = fnLineWidth(elem, i);
                var radius = fnRadius(elem, i); // radius in degrees
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
                    drawCircle(context, plat, plon + context.width/xscale, pradius, color, strokeColor, lineWidth);
                } else if(plon > context.width/xscale-pradius){
                    drawCircle(context, plat, plon - context.width/xscale, pradius, color, strokeColor, lineWidth);
                }
                drawCircle(context, plat, plon, pradius, color, strokeColor, lineWidth);
                context.restore();
            }
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
        points.strokeColor = function(val){
            if(arguments.length == 0) return fnStrokeColor;
            if(typeof val == "function") fnStrokeColor = val;
            else fnStrokeColor = function(){return val;};
            return points;
        }
        points.lineWidth = function(val){
            if(arguments.length == 0) return fnLineWidth;
            if(typeof val == "function") fnLineWidth = val;
            else fnLineWidth = function(){return val;};
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
                    var lat = parseFloat(fnLat(data[i], i));
                    var lon = parseFloat(fnLon(data[i], i));
                    var rad = parseFloat(fnRadius(data[i], i));
                    var dlat = lat - latlon[0];
                    var dlon = (lon - latlon[1]) * Math.cos(lat*Math.PI/180);
                    var d = Math.sqrt(dlat*dlat+dlon*dlon);
                    // within 2 degrees counts as a click
                    if(d > Math.max(2, rad+2)) continue;
                    if(!mind || (d < mind)){
                        mind = d;
                        evt.point = data[i];
                    }
                }
                callback(evt);
            });
            return points;
        }

        overlayTex.push(points);
        return points;
    };

    globe.bars = function() {
        var identityFn = function(d) {
            return d;
        };
        var fns = {
            fnData: identityFn,
            prevFnData: false,
        };
        var transitions = [];
        var barsFs, barsVs;
        var barObjs = {};
        function bars(gl, datum){
            // If user has changed data element, remove previous bars
            removePreviousBars(gl, datum);

            // Update transition state
            bars.transition.update();

            // reeval every bar, at 60fps
            var array = fns.fnData(datum);
            array.forEach(function(elem){
                // compute properties
                var state =  {
                    latRad: (Math.PI/180)*fns.fnLat(elem),
                    lonRad: (Math.PI/180)*fns.fnLon(elem) + Math.PI/2,
                    color: fns.fnColor(elem),
                    height: fns.fnHeight(elem), // in units of globe radius
                    width: fns.fnWidth(elem)
                }

                var elemId = fns.fnId(elem);
                var bar = barObjs[elemId]; 
                if(!bar){
                    // create only if neccessary
                    var uniforms = {
                        color: {
                            type: "c",
                            value: new THREE.Color("0x"+state.color.slice(1))
                        }
                    };
                    bar = new THREE.Mesh(
                        new THREE.CubeGeometry(1,1,1),
                        new THREE.ShaderMaterial({
                            vertexShader: shaders.bars.vertex,
                            fragmentShader: shaders.bars.fragment,
                            uniforms: uniforms
                        }));
                    bar.uniforms = uniforms;
                    bar.state = {
                        latRad: 0,
                        lonRad: 0,
                        color: 0,
                        height: 0,
                        width: 0,
                    };
                    barObjs[elemId] = bar;
                    gl.scene.add(bar);
                    gl.meshes.bars.push(bar);
                }

                // save currenet state
                bar.state = state;

                // update to transitioning state if applicable
                bars.transition.updateBarState(bar, elem);

                // update
                var x0 = -bar.state.width/2, x1 = bar.state.width/2;
                var y0 = -bar.state.width/2, y1 = bar.state.width/2;
                var z0 = 1, z1 = 1 + bar.state.height;
                bar.geometry.vertices[0] = new THREE.Vector3(x1,y1,z1);
                bar.geometry.vertices[1] = new THREE.Vector3(x1,y1,z0);
                bar.geometry.vertices[2] = new THREE.Vector3(x1,y0,z1);
                bar.geometry.vertices[3] = new THREE.Vector3(x1,y0,z0);
                bar.geometry.vertices[4] = new THREE.Vector3(x0,y1,z0);
                bar.geometry.vertices[5] = new THREE.Vector3(x0,y1,z1);
                bar.geometry.vertices[6] = new THREE.Vector3(x0,y0,z0);
                bar.geometry.vertices[7] = new THREE.Vector3(x0,y0,z1);
                bar.geometry.verticesNeedUpdate = true;
                bar.uniforms.color.value = new THREE.Color(
                    "0x"+bar.state.color.slice(1));
                bar.orientation = new THREE.Vector3(-bar.state.latRad, bar.state.lonRad, 0);
            });
        }

        bars.id = function(val) {
            if(arguments.length == 0) return fnId;
            var fn = (typeof val == "function") ? val : function(){return val};
            if(transitions.length>0) {
                transitions[transitions.length-1].fnId = fn;
            } else {
                fns.fnId = fn;
            }
            return bars;
        }
        bars.latitude = function(val){
            if(arguments.length == 0) return fnLat;
            var fn = (typeof val == "function") ? val : function(){return val};
            if(transitions.length>0) {
                transitions[transitions.length-1].fnLat = fn;
            } else {
                fns.fnLat = fn;
            }
            return bars;
        }
        bars.longitude = function(val){
            if(arguments.length == 0) return fns.fnLon;
            var fn = (typeof val == "function") ? val : function(){return val};
            if(transitions.length>0) {
                transitions[transitions.length-1].fnLon = fn;
            } else {
                fns.fnLon = fn;
            }
            return bars;
        }
        bars.color = function(val){
            if(arguments.length == 0) return fns.fnColor;
            var fn = (typeof val == "function") ? val : function(){return val};
            if(transitions.length>0) {
                transitions[transitions.length-1].fnColor = fn;
            } else {
                fns.fnColor = fn;
            }
            return bars;
        }
        bars.width = function(val){
            if(arguments.length == 0) return fns.fnWidth;
            var fn = (typeof val == "function") ? val : function(){return val};
            if(transitions.length>0) {
                transitions[transitions.length-1].fnWidth = fn;
            } else {
                fns.fnWidth = fn;
            }
            return bars;
        }
        bars.height = function(val){
            if(arguments.length == 0) return fns.fnHeight;
            var fn = (typeof val == "function") ? val : function(){return val};
            if(transitions.length>0) {
                transitions[transitions.length-1].fnHeight = fn;
            } else {
                fns.fnHeight = fn;
            }
            return bars;
        }
        bars.data = function(val){
            if(arguments.length == 0) return fns.fnData;
            var fn = (typeof val == "function") ? val : function(){return val};
            if(transitions.length>0) {
                transitions[transitions.length-1].prevFnData = fns.fnData;
                transitions[transitions.length-1].fnData = fn;
            } else {
                if(fns.fnData != identityFn) {
                    fns.prevFnData = fns.fnData;
                }
                fns.fnData = fn;
            }
            return bars;
        }
        bars.on = function(eventName, callback){
            globe.on(eventName, function(evt){
                var latlon = evt.latlon;
                if(latlon == null) return;
                
                // find the point that was intersected
                evt.bar = null;
                var data = fns.fnData(evt.datum);
                var mind = null;
                for(var i = 0; i < data.length; i++){
                    var lat = fns.fnLat(data[i], i);
                    var lon = fns.fnLon(data[i], i);
                    var rad = fns.fnWidth(data[i], i)/2;
                    var dlat = lat - latlon[0];
                    var dlon = (lon - latlon[1]) * Math.cos(lat*Math.PI/180);
                    var d = Math.sqrt(dlat*dlat+dlon*dlon);
                    // within 4 degrees counts as a click
                    if(d > Math.max(4, rad+2)) continue;
                    if(!mind || (d < mind)){
                        mind = d;
                        evt.bar = data[i];
                    }
                }
                callback(evt);
            });
            return bars;
        }

        bars.transition = function() {
            transitions.push({started: false});
            return bars;
        }
        bars.transition.update = function() {
            if(transitions.length == 0) return;
            var transition = transitions[0];
            
            // start transition by initializing transition vars
            if(!transition.started) {
                transition.started = true;
                transition.t = 0.0;
                transition.dt = 1/transitions[0].duration;
            }
            if(transition.delay-- > 0) return;
            transition.t += transition.dt;
        }
        bars.transition.updateBarState = function(bar, dataElem) {
            if(transitions.length==0) return;

            var transition = transitions[0];
            var target = { //TODO: extend to other attributes
                height: transition.fnHeight(dataElem)
            };
            if(transition.t >= 1.) {
                bar.state.height = target.height;
                bars.transition.end(bar);
            } else {
                // Find appropriate t value
                var t;
                if(typeof transition.fnEase != 'undefined') {
                    t = transition.fnEase(transition.t);
                } else {
                    t = transition.t;
                }

                // update bar height; TODO: update other attributes too
                bar.state.height = bar.state.height +
                    (target.height - bar.state.height)*t;
            }
        }
        bars.transition.end = function(bar) {
            Object.keys(transitions[0]).forEach(function(fnKey) {
                if(typeof fns[fnKey] != 'undefined') {
                    fns[fnKey] = transitions[0][fnKey];
                }
            });
            transitions = transitions.slice(1);
        }
        bars.delay = function(val) {
            // store delay in terms of fps
            transitions[transitions.length-1].delay = 60*val/1000;
            return bars;
        }
        bars.duration = function(val) {
            transitions[transitions.length-1].duration = val;
            return bars;
        }
        bars.ease = function(val, param1, param2) {
            var fn = (typeof val == "function") ? val : d3.ease(val, param1, param2);
            transitions[transitions.length-1].fnEase = fn; 
            return bars;
        }

        function removePreviousBars(gl, datum) {
            if(!fns.prevFnData) return;
            var array = fns.prevFnData(datum);
            array.forEach(function(elem){
                var elemId = fns.fnId(elem);
                var bar = barObjs[elemId]; 
                gl.scene.remove(bar);
                delete barObjs[elemId];
            });
            gl.meshes.bars = [];
            fns.prevFnData = false;
        }

        overlay3D.push(bars);
        return bars;
    };


    /**
     * ARCS
     */
    globe.arcs = function(){
        var fnData = function(globeDatum){return globeDatum;};

        var fnId = function(d,i){return i;};
        var fnStart, fnEnd; // required arguments: start/end lat lon
        var fnApex = function(){return 0.05}; // apex height, in globe radii
        var fnLineWidth = function(){return 1}; // line thickness, in degrees
        var fnOpacity = function(){return 1};
        var fnPartialArc = function(){return 1}; // less than 1 to end arc midway
        var fnColor = function(){return 0x000000};

        var arcObjs = {};
        function arcs(gl, datum){
            // reeval every arc, at 60fps
            var array = fnData(datum);
            var elemIds = []
            array.forEach(function(elem, ix){
                var elemId = fnId(elem, ix);
                elemIds.push(elemId);
                var arc = arcObjs[elemId]; 
                if(!arc){ 
                    // enter 
                    arc = new THREE.Line(new THREE.Geometry(), new THREE.LineBasicMaterial());
                    arcObjs[elemId] = arc;
                    arc.orientation = {x:0,y:0,z:0};
                    gl.scene.add(arc);
                    gl.meshes.arcs.push(arc);
                }

                // compute the great circle (shortest path)
                var llS = fnStart(elem);
                var llE = fnEnd(elem);
                var latS = llS[0]*Math.PI/180, lonS = llS[1]*Math.PI/180;
                var latE = llE[0]*Math.PI/180, lonE = llE[1]*Math.PI/180;
                var vS = new THREE.Vector3(
                    Math.cos(latS)*Math.cos(lonS),
                    Math.sin(latS),
                    -Math.cos(latS)*Math.sin(lonS));
                var vE = new THREE.Vector3(
                    Math.cos(latE)*Math.cos(lonE),
                    Math.sin(latE),
                    -Math.cos(latE)*Math.sin(lonE));
                //console.log("WAT? "+vS.x+","+vS.y+","+vS.z+","+vE.x+","+vE.y+","+vE.z);
                var vAxis = new THREE.Vector3().cross(vS, vE);
                var theta = vS.angleTo(vE);
                var npoints = 100;
                var partialArc = fnPartialArc(elem,ix);
                var matA = new THREE.Matrix4().rotateByAxis(vAxis, theta*partialArc/npoints);
                var matB = new THREE.Matrix4().rotateByAxis(vAxis, -theta*partialArc/npoints);
                var mat;
                if(matA.multiplyVector3(new THREE.Vector3().copy(vS)).distanceTo(vE) <
                   matB.multiplyVector3(new THREE.Vector3().copy(vS)).distanceTo(vE)){
                    mat = matA;
                } else {
                    mat = matB;
                }
                
                // update the line geometry
                var arcGeom = arc.geometry;
                var apex = fnApex(elem, ix);
                var vecGS = new THREE.Vector3().copy(vS);
                arcGeom.vertices = [];
                for(var i = 0; i < npoints; i++){
                    var t = partialArc*i/(npoints-1);
                    /*var lat = (llS[0]*(1-t) + llE[0]*t)*Math.PI/180;
                    var lon = (llS[1]*(1-t) + llE[1]*t)*Math.PI/180;
                    var x = Math.cos(lon)*Math.cos(lat);
                    var z = Math.sin(lon)*Math.cos(lat);
                    var y = Math.sin(lat);*/
                    mat.multiplyVector3(vecGS);

                    // lift it above the globe surface
                    var radius = t*(1-t)*4; // in [0,1]
                    radius = 1-(1-radius)*(1-radius); // steeper rise/fall
                    radius = radius*apex + 1;
                    var vecArc = new THREE.Vector3().copy(vecGS).multiplyScalar(radius);
                    arcGeom.vertices.push(vecArc);
                }
                arcGeom.verticesNeedUpdate = true;

                // update the line appearance
                var col = fnColor(elem,ix);
                var opa = fnOpacity(elem,ix);
                var lw = fnLineWidth(elem,ix);
                arc.material = new THREE.LineBasicMaterial({
                    color: col, 
                    opacity: opa,
                    linewidth: lw
                });
            });

            //exit
        }
        arcs.data = function(data){
            if(!arguments.length)return fnData;
            if(typeof(data)==="function") fnData = data;
            else fnData = function(){return data;}
            return arcs;
        }
        arcs.start = function(startLatLon){
            if(!arguments.length) return fnStart;
            if(typeof(startLatLon)==="function") fnStart = startLatLon;
            else fnStart = function(){return startLatLon;}
            return arcs;
        }
        arcs.end = function(endLatLon){
            if(!arguments.length) return fnEnd;
            if(typeof(endLatLon)==="function") fnEnd = endLatLon;
            else fnEnd = function(){return endLatLon;}
            return arcs;
        }
        arcs.apex = function(apex){
            if(!arguments.length) return fnApex;
            if(typeof(apex)==="function") fnApex = apex;
            else fnApex = function(){return apex;}
            return arcs;
        }
        arcs.lineWidth = function(lineWidth){
            if(!arguments.length) return fnLineWidth;
            if(typeof(lineWidth)==="function") fnLineWidth = lineWidth;
            else fnLineWidth = function(){return lineWidth;}
            return arcs;
        }
        arcs.color = function(color){
            if(!arguments.length) return fnColor;
            if(typeof(color)==="function") fnColor = color;
            else fnColor = function(){return color;}
            return arcs;
        }
        arcs.opacity = function(opacity){
            if(!arguments.length) return fnOpacity;
            if(typeof(opacity)==="function") fnOpacity = opacity;
            else fnOpacity = function(){return opacity;}
            return arcs;
        }
        arcs.partialArc = function(partialArc){
            if(!arguments.length) return fnPartialArc;
            if(typeof(partialArc)==="function") fnPartialArc = partialArc;
            else fnPartialArc = function(){return partialArc;}
            return arcs;
        }

        overlay3D.push(arcs);
        return arcs;
    }


    
    /*
     * Free-form painting onto the globe texture.
     */
    globe.painter = function() {
        var fnData = function(d) { return d; };
        var fnPaint;
        function painter(gl, context, datum) {
            fnPaint(gl, context, fnData(datum));
        }
        painter.paint = function(val) {
            if(arguments.length == 0) return fnPaint;
            if(typeof val == "function") fnPaint = val;
            else fnPaint = function(){return val;};
            return painter;
        }
        painter.data = function(val){
            if(arguments.length == 0) return fnData;
            if(typeof val == "function") fnData = val;
            else fnData = function(){return val;};
            return painter;
        }
        
        overlayTex.push(painter);
        return painter;
    }

    // heatmap    
    globe.heatmap = function() {
        var fnData = function(d) { return d; };
        var heatCanvas = document.createElement("canvas"); // hidden canvas
        var gradientCanvas = document.createElement("canvas");

        var fnLat, fnLon;
        var fnDensity; // takes uv coord and returns density [0, 1]
        var radius, gradient;
        var heatmapImg;
        var update = true;
        function heatmap(gl, context, datum) {
            if(update) {
                heatmapImg = renderHeatmap(gl, context, fnData(datum));
                update = false;
            }
            context.drawImage(heatmapImg, 0, 0, context.width, context.height);
        }

        function renderHeatmap(gl, context, data) {
            var rx = context.width;
            var ry = context.height;
            heatCanvas.width = rx;
            heatCanvas.height = ry;
            var heatContext = heatCanvas.getContext("2d");
            heatContext.clearRect(0, 0, rx, ry);

            // set up gradient
            if(!gradient) {
                gradient = {};
                gradient.stops = { 0.4: "rgb(0,0,255)", 0.5: "rgb(0,255,255)",
                    0.6: "rgb(0,255,0)", 0.8: "yellow", 0.95: "rgb(255,0,0)"};
                gradient.length = gradientCanvas.width = 100;
                gradientCanvas.height = 10;
                var gradientContext = gradientCanvas.getContext("2d");
                var linearGradient = gradientContext.createLinearGradient(0, 0, 100, 10);

                Object.keys(gradient.stops).forEach(function(key) {
                    linearGradient.addColorStop(key, gradient.stops[key]);
                });

                gradientContext.fillStyle = linearGradient;
                gradientContext.fillRect(0, 0, 100, 10);
                gradient.data = gradientContext.getImageData(0, 5, 100, 5).data;
            }
            
            // set shadow properties
            if(!radius) radius = 0.01*rx; // default radius is 1% of width
            heatContext.shadowOffsetX = 20000;
            heatContext.shadowOffsetY = 20000;
            heatContext.shadowBlur = radius;

            // for each data, draw a shadow
            data.forEach(function(d) {
                // get properties for data element
                var lat = parseFloat(fnLat(d));
                var lon = parseFloat(fnLon(d));
                var density = fnDensity(d);
                //var pradius = radius * context.width / 360.0;
                var plat = ry * (1-(lat + 90)/180);
                var plon = rx * (lon + 180)/360;

                // draw shadow
                heatContext.shadowColor = 'rgba(0, 0, 0,'+density+')';
                heatContext.beginPath();
                heatContext.arc(plon-20000, plat-20000, radius, 0, 2*Math.PI, true);
                heatContext.closePath();
                heatContext.fill();
            });

            // color the shadows according to density
            var pixels = heatContext.getImageData(0, 0, rx, ry);
            for(var r=0; r<ry; r++) {
                for(var c=0; c<rx; c++) {
                    var idx = (c + r*rx)*4;
                    var density = pixels.data[idx + 3]/255;
                    var offset = (Math.floor(gradient.length * density))*4;
                    pixels.data[idx] = gradient.data[offset];
                    pixels.data[idx + 1] = gradient.data[offset + 1];
                    pixels.data[idx + 2] = gradient.data[offset + 2];
                }
            }
            heatContext.clearRect(0, 0, rx, ry);
            heatContext.putImageData(pixels, 0, 0);

            var map = new Image();
            map.src = heatCanvas.toDataURL("image/png");
            return map;
        }

        heatmap.data = function(val) {
            if(arguments.length == 0) return fnData;
            if(typeof val == "function") fnData = val;
            else fnData = function(){return val;};
            return heatmap;
        }

        heatmap.radius = function(val) {
            if(arguments.length == 0) return radius;
            radius = val;
            return heatmap;
        }

        heatmap.latitude = function(val) {
            if(arguments.length == 0) return fnLat;
            if(typeof val == "function") fnLat = val;
            return heatmap;
        }

        heatmap.longitude = function(val) {
            if(arguments.length == 0) return fnLon;
            if(typeof val == "function") fnLon = val;
            return heatmap;
        }

        heatmap.density = function(val) {
            if(arguments.length == 0) return fnDensity;
            if(typeof val == "function") fnDensity = val;
            else fnDensity = function(){return val;};
            return heatmap;
        }

        overlayTex.push(heatmap);
        return heatmap;
    }

    /// *** SHADERS
    /*
     * Globe shader
     * Composites a base layer, shape layer, and canvas layer.
     *
     * The base layer is simply an image, with configurable transparency.
     * Used by all globes, see globe.texture(...).transparency(...).
     *
     * The shape layer consists of two textures, one which is static (ids shapes)
     * and another which is a color->color lookup, and may be animated. It lets you
     * eg color the world's countries by GDP.
     * Used by globe.shapes(), etc.
     *
     * The canvas layer comes from an offscreen canvas, and supports arbitrary drawings.
     * Used by globe.points(), etc.
     */
    shaders.globe = {};
    shaders.globe.vertex = [
"// texture coordinate for vertex to be interpolated and passed into",
"// fragment shader per fragment",
"varying vec2 vUv;",
"",
"void main() {",
"    vUv = uv;",
"    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1);",
"}"
].join("\n");
    shaders.globe.fragment = [
"uniform sampler2D texBase;    // background texture",
"uniform sampler2D texOverlay; // canvas overlay texture",
"",
"uniform sampler2D texShapes;  // shape texture. grayscale.",
"uniform sampler2D texColorLookup; // shape color -> color",
"uniform int lookupShapes;",
"",
"uniform float transparency;",
"varying vec2 vUv;             // texture coordinats",
"",
"int colorToShapeId(vec3 rgb) {",
//"    return int(rgb.r*10.*10.*10. + rgb.g*10.*10. + rgb.b*10.);",
"    // first put rgb into [0, 255] scale",
"    float r = clamp(rgb.r * 256., 0., 255.);",
"    float g = clamp(rgb.g * 256., 0., 255.);",
"    float b = clamp(rgb.b * 256., 0., 255.);",
"",    
"    float divisor = 25.5;",
"    int dr = int(r/divisor + 0.5);",
"    int dg = int(g/divisor + 0.5);",
"    int db = int(b/divisor + 0.5);",
"    return dr*10*10 + dg*10 + db;",
"}",
"",
"vec4 lookupColor(vec2 uv) {",
"    vec4 shapeColor = texture2D(texShapes, vec2(",
"        clamp(uv.x, 0., 1.), clamp(uv.y, 0., 1.)));",
"    int id = 3*colorToShapeId(shapeColor.rgb) + 1;",
"    return texture2D(texColorLookup, vec2(float(id)/3072., 0.));",
"}",
"",
"void main() {",
"    vec4 colorShape = vec4(0.);",
"    if(lookupShapes==1) {",
"        float du = 1./4000.;",
"        float dv = 1./2000.;",
"        float maxDistance = sqrt(8.);",
"        for(int dx=-2; dx<=2; dx++) {",
"            for(int dy=-2; dy<=2; dy++) {",
"                vec2 dist = vec2(float(dx)*du, float(dy)*dv);",
"                vec4 nextColor = lookupColor(vec2(",
"                    vUv.x+dist.x,",
"                    vUv.y+dist.y",
"                ));",
"                colorShape = mix(nextColor, colorShape,",
"                    smoothstep(0., maxDistance, length(vec2(dx, dy))));",
"            }",
"        }",
"    }",
"",
"    vec4 colorBase = texture2D(texBase, vUv);",
"    vec4 colorOverlay = texture2D(texOverlay, vUv);",
"",
"    gl_FragColor = mix(gl_FragColor, colorBase, 1.0);",
"    gl_FragColor = mix(gl_FragColor, colorShape, colorShape.a);",
"    gl_FragColor = mix(gl_FragColor, colorOverlay, colorOverlay.a);",
"    gl_FragColor.a = max(colorShape.a, max(colorOverlay.a, transparency));",
"}",
].join("\n");

    /**
     * Bar shader. Creates bar charts on the globe.
     */
    shaders.bars = {};
    shaders.bars.vertex = [
"void main() {",
"    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1);",
"}"
].join("\n");
    shaders.bars.fragment = [
"uniform vec3 color;",
"",
"void main() {",
"    gl_FragColor = vec4(color, 1.0);",
"}"
].join("\n");
    
    /**
     * Shader for atmospheric effect
     */
    shaders.atmosphere = {};
    shaders.atmosphere.vertex = [
"varying vec3 vNormal;",
"void main() {",
"   vNormal = normalize(normalMatrix * normal);",
"   gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1);",
"}"
].join("\n");
    shaders.atmosphere.fragment = [
"uniform int atmosphereFlag;",
"uniform vec3 atmosphereColor;", 
"varying vec3 vNormal;",
"void main() {",
"   if(atmosphereFlag==0) {",
"       gl_FragColor = vec4(0);",
"       return;",
"   }",
"   float halo = 0.2-vNormal.z;",
"   halo *= halo;",
"   gl_FragColor = vec4(atmosphereColor,halo);",
"}"
].join("\n");

    return globe;
};
