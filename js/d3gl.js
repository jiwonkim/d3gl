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
        sphereMaterialBack.depthTest = false;
        sphereMaterialBack.depthWrite = false;
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
        var rlat = rotation.lat*Math.PI/180;
        var rlon = rotation.lon*Math.PI/180;
        var rot = new THREE.Matrix4();
        rot.rotateY(rlon);
        rot.rotateX(-rlat);
        point = rot.multiplyVector3(point);
        //console.log(""+point);
        var lat = Math.asin(point.y);
        var lon = Math.atan2(point.x, point.z);
        lat = 180/Math.PI*lat;
        lon = 180/Math.PI*lon;
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
                    overlayTex[i](gl, context, d);
                }
                gl.textures.overlay.needsUpdate = true; // tell 3js to update
                
                // draw the objects in scene
                for(var i = 0; i < gl.meshes.length; i++) {
                    gl.meshes[i].rotation.x = gl.meshes[i].orientation.x + rotation.lat*Math.PI/180.0;
                    gl.meshes[i].rotation.y = gl.meshes[i].orientation.y - (rotation.lon+90)*Math.PI/180.0;
                }
                gl.camera.position.z = 1+zoom;
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
            end:{"lat":latlon[0],"lon":latlon[1]},
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
        function drawCircle(context, plat, plon, pradius, color){
            context.beginPath();
            context.arc(plon, plat, pradius, 0, 2*Math.PI, false);
            context.fillStyle = color;
            context.fill();
        }
        function points(gl, context, datum){
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
            return points;
        }

        overlayTex.push(points);
        return points;
    };

    globe.bars = function() {
        var fnData = function(d){return d;};
        var fnLat, fnLon, fnColor, fnHeight;
        var barsFs, barsVs;
        function bars(gl, datum){
            // render the points into a texture that goes on the globe
            var array = fnData(datum);
            /*
            var barMaterial = new THREE.ShaderMaterial({
                vertexShader: shaders.bars.vertex,
                fragmentShader: shaders.bars.fragment,
                attributes: attributes,
            });
            */

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

                var bar = new THREE.Mesh(
                    new THREE.CubeGeometry(0.01, 0.01, 2.5),
                    new THREE.MeshNormalMaterial()
                );
                bar.orientation = new THREE.Vector3(
                    Math.cos(lat)*Math.cos(lon),
                    Math.sin(lat),
                    Math.cos(lat)*Math.sin(lon)
                );
                console.log(bar.orientation);

                /*
                var hex = "0x" + color.slice(1);
                attributes.customColor.value.push()
                var attributes = {
                    customColor: {
                        type: "c",
                        value: [new THREE.Color(hex)]
                    }
                };
                */

                gl.scene.add(bar);
                gl.meshes.push(bar);
            });

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
"attribute vec3 customColor;",
"varying vec3 vColor;",
"",
"void main() {",
"    vColor = customColor;",
"    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1);",
"}"
].join("\n");
    shaders.bars.fragment = [
"varying vec3 vColor;",
"",
"void main() {",
"    gl_FragColor = vec4(vColor, 1.0);",
"}"
].join("\n");


    return globe;
};
