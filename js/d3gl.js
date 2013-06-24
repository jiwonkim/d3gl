// Jiwon Kim and Dan Posch
// {jiwonk, dcposch}@cs.stanford.edu

// check prerequisites 
if(!d3 || !jQuery || !THREE || !requestAnimationFrame){
    throw "D3GL requires D3, JQuery, ThreeJS, and RequestAnimationFrame";
}

d3.gl = function() {
    function d3gl() {}

    /** PUBLIC **/
    d3gl.orthographicCamera = false;
    d3gl.width = function(val){
        if(!arguments.length) return width;
        width = val;
    }
    d3gl.height = function(val){
        if(!arguments.length) return height;
        height = val;
    }
    d3gl.zoomUpdated = false;
    d3gl.zoom = function(val) {
        if (arguments.length === 0){
					return zoom; 
        } else {
          zoom = val;
        }
    };
    d3gl.rotation = {"lat":0,"lon":0};
		d3gl.rotationMatrix = new THREE.Matrix4();
    d3gl.mouseEventCallback = function(val) {
        if (arguments.length === 0) return mouseEventCallback;
        else mouseEventCallback = val;
    }
    d3gl.init = function(gl, ortho) {
        if (ortho) d3gl.orthographicCamera = true;
        initGL(gl);
        initControls(gl, gl.renderer.domElement);
        initStyle(gl.renderer.domElement); // <canvas> style
    };
    d3gl.fireEvent = function(name, evt) {
        var handlers = eventHandlers[name];
        if (handlers.length == 0) return;
        for(var i = 0; i < handlers.length; i++){
            handlers[i](evt);
        }
    };
    d3gl.addEventHandler = function(eventName, callback) {
        if(typeof(eventHandlers[eventName])==="undefined"){
            throw "unsupported event "+eventName;
        }
        eventHandlers[eventName].push(callback);
    };
    // To be called on each render loop
    d3gl.update = function(gl) {
        if (d3gl.orthographicCamera) {
          gl.camera.left = -zoom*width/height;
          gl.camera.right = zoom*width/height;
          gl.camera.top = -zoom;
          gl.camera.bottom = zoom;
          gl.camera.updateProjectionMatrix();
        } else {
          gl.camera.position.z = 1 + zoom;
        }
    }
    d3gl.rotate = function(latlon) {
        d3gl.rotation.lat = latlon[0];
        d3gl.rotation.lon = latlon[1];

        d3gl.rotationMatrix = new THREE.Matrix4().makeRotationFromEuler({
          x:latlon[0]*Math.PI/180, 
          y:latlon[1]*Math.PI/180, 
          z:latlon.length==3 ? latlon[2]*Math.PI/180 : 0
        });
    }
    d3gl.orient = function(orientation) {
        switch(orientation) {
          case "x": d3gl.rotate([90, 180, 90]); break;
          case "-x": d3gl.rotate([90, 90, 270]); break;
          case "y": d3gl.rotate([90, 90]); break;
          case "-y": d3gl.rotate([270, 0]); break;
          case "z": d3gl.rotate([0, 0]); break;
          case "-z": d3gl.rotate([180, 0, 270]); break;
          default: break;
        }
        console.log(orientation + ": ");
    }

    /** THREE.js model scaling and centering related **/
    d3gl.scaleModel = function(model, multiplier, gl) {
        var updateMatrix = gl.scale || model.geometry;
        if (!gl.scale) {
            var bbox = getBoundingBox(model);
            var w = bbox.max.x - bbox.min.x;
            var h = bbox.max.y - bbox.min.y;
            var depth = bbox.max.z - bbox.min.z;
            gl.scale = 2/Math.max(w, Math.max(h, depth));
            gl.scale *= multiplier;
        }
        if (updateMatrix) {
            model.scale.x = model.scale.y = model.scale.z = gl.scale;
            model.updateMatrix();
        }
    };
    d3gl.centerModel = function(model, gl) {
        if (!gl.centerTranslation) {
            var bbox = getBoundingBox(model);
            var centerPoint = new THREE.Vector3().addVectors(bbox.min, bbox.max)
                .multiplyScalar(0.5);
            gl.centerTranslation = new THREE.Vector3().subVectors(
                model.position, centerPoint);
            translateModelVertices(model, gl.centerTranslation);

        // TODO: check if gl.scale exists, etc.
        } else {
            translateModelVertices(model, new THREE.Vector3().copy(gl.centerTranslation).multiplyScalar(gl.scale));
        }
        model.updateMatrix();
    };
    // Following isn't used anywhere.. TODO?
    d3gl.centerModelByWeight = function(model, gl) {
        if (!gl.centerTranslation) {
            var centerPoint = new THREE.Vector3();
            addVertices(model, centerPoint);
            centerPoint.multiplyScalar(1/countVertices(model));
            gl.centerTranslation = new THREE.Vector3().subVectors(
              model.position, centerPoint);
            translateModelVertices(model, gl.centerTranslation);
        } else {
            translateModelVertices(model, new THREE.Vector3().copy(gl.centerTranslation).multiplyScalar(gl.scale));
        }

        model.updateMatrix();
    };
    function translateModelVertices(model, translation) {
        if(model.geometry){
            model.geometry.vertices.forEach(function(vertex) {
                vertex.add(translation);
            });
        } else {
            for(var i in model.children){
                child = model.children[i];
                translateModelVertices(child, translation);
            }
        } 
    }
    function countVertices(model) {
        if (!model) return null;
        if (!model.geometry) {
            var count = 0; 
            model.children.forEach(function(child) {
                count += countVertices(child);
            });
            return count;
        }
        return model.geometry.vertices.length;
    }
    function addVertices(model, sum) {
        if (!model) return null;
        if (!model.geometry) {
            model.children.forEach(function(child) {
                addVertices(child, sum);
            });
        } else {
            model.geometry.vertices.forEach(function(vertex) {
                sum.add(vertex);
            });
        }
    }
    function getBoundingBox(model) {
        if (!model) return null;
        if (!model.geometry) {
            var bbox = new THREE.Box3();
            model.children.forEach(function(child) {
                bbox.union(getBoundingBox(child));
            });
            return bbox;
        }
        model.geometry.computeBoundingBox();
        return model.geometry.boundingBox;
    }

    /** PRIVATE **/
    // variables
    var zoom;
    var dragStart = null;
    var eventHandlers = {
        // mouse handlers
        'mousedown':[],
        'mousemove':[],
        'mouseup':[],
        'click':[],
        'dblclick':[],
        // fired before each render
        'update':[]
    };
    // viewport dimensions, in pixels
    var width = 400;
    var height = 400;
    // user-defined callback function for when mouse events are fired
    var mouseEventCallback;
    // constants
    var MIN_ZOOM = 0.01;
    var MAX_ZOOM = 10;
    var MOUSE_SENSITIVITY = 0.3; // degrees rotated per pixel
    var ZOOM_SENSITIVITY = 0.1; // (0 = no effect, 1 = infinite)
    var VIEW_ANGLE = 30,
        NEAR = 0.01,
        FAR = 100;

    // This is not quite as clean as
    // an external stylesheet, but simpler for
    // the end user.
    function initStyle(elem) {
        elem.style.cursor = "pointer";
    }

    function initControls(gl, elem){
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
            else if(key=="a") d3gl.rotation.lon -= 10;
            else if(key=="d") d3gl.rotation.lon += 10;
            else if(key=="x" || key=="y" || key=="z") d3gl.orient(key);
            else return;
            evt.preventDefault();
        });
    }
    function initGL(gl) {
        var scene, camera, renderer;

        // scene
        scene = new THREE.Scene();

        // camera
        if (d3gl.orthographicCamera) { // currently no primitive using ortho
          camera = new THREE.OrthographicCamera();
          MOUSE_SENSITIVITY = 1;
				  camera.position.z = 5;
        } else {
          camera = new THREE.PerspectiveCamera(
              VIEW_ANGLE, width/height,
              NEAR, FAR);
        }
        if (!zoom) d3gl.zoom(2);
        scene.add(camera);

        // start the renderer
        renderer = new THREE.WebGLRenderer({
            antialias: true
        });
        renderer.setSize(width, height);

        gl.scene = scene;
        gl.camera = camera;
        gl.renderer = renderer;
        gl.projector = new THREE.Projector();
        window.gl = gl;
    }
    function zoomUpdate(val) {
        //TODO: in orthographic perspective, just make the camera window smaller
        zoom *= val;
        zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    };
    function dragUpdate(evt) {
				var inverseRotationMatrix = new THREE.Matrix4().getInverse(d3gl.rotationMatrix);
				// Conver camera coordinates x, y, z axes to object coordinate axes
				var x = new THREE.Vector3(1, 0, 0).applyMatrix4(inverseRotationMatrix);
				var y = new THREE.Vector3(0, 1, 0).applyMatrix4(inverseRotationMatrix);

				// diff y: rotate around the x-axis-turned-object-coord axis
				var diffY = (evt.pageY - dragStart[1])*MOUSE_SENSITIVITY*(Math.PI/180)*zoom;
				var rotateY = new THREE.Matrix4().makeRotationAxis(x, diffY);
				d3gl.rotationMatrix.multiply(rotateY);

				// diff x: rotate around the y-axis-turned-object-coord axis
				var diffX = (evt.pageX - dragStart[0])*MOUSE_SENSITIVITY*(Math.PI/180)*zoom;
				var rotateX = new THREE.Matrix4().makeRotationAxis(y, diffX);
				d3gl.rotationMatrix.multiply(rotateX);

        // shitty deprecated rotation, soon to be removed...
				d3gl.rotation.lon -= (evt.pageX - dragStart[0])*MOUSE_SENSITIVITY*zoom;
				d3gl.rotation.lat += (evt.pageY - dragStart[1])*MOUSE_SENSITIVITY*zoom;
				d3gl.rotation.lon %= 360;
				d3gl.rotation.lat %= 360;
    };
    function fireMouseEvent (name, gl, evt) {
        var handlers = eventHandlers[name];
        if (handlers.length == 0) return;
        evt.datum = gl.datum;

        // If the d3gl type has registered a callback for mouse events,
        // make the function call with the evt object
        if (mouseEventCallback) {
            mouseEventCallback(gl, evt);
        }
        for(var i = 0; i < handlers.length; i++){
            handlers[i](evt);
        }
    };
    return d3gl;
};
d3.gl.globe = function(){
    var d3gl = d3.gl();

    // *** see PROPERTIES
    // callbacks (globe-level. see shapes(), points(), etc)
    var fnTex, fnTransparency;
    // atmosphere is turned off by default
    var fnAtmosphere = function(d) { return false; };

    var update;
    var numGlobes = 0;

    // *** PRIVATE
    // overlays. these are functions that either render onto the globe tex
    // (eg colored countries), or which run after the globe itself to draw
    // additional 3D elements (eg bars, arcs)
    var overlayTex = []; // function(gl, context2d)
    var overlay3D = []; // function(gl)
    var shaders = {}; // hardcoded strings, see bottom

    // animation
    var anim = {};

    // *** RENDER FUNCTION
    // see http://bost.ocks.org/mike/chart/
    function globe(g){
        numGlobes = g[0].length;
        update = numGlobes;
        console.log(update);
        g.each(globeInit);
    }
    function globeInit(d,i){
        // validate 
        if(this.tagName == "canvas") throw "D3GL creates its own canvas elements. "+
            "Render into a <div>, not directly into a <canvas>."

        // gl stores all the rendering state for each individual globe.
        // remember that a call to d3.gl.globe() may result in multiple
        // globes (one per datum)
        var gl = {};
        gl.element = this; // the D3 primitive: one dom element, one datum
        gl.datum = d;
        gl.index = i;
        gl.shaders = shaders.globe;
        gl.textures = {};


        // load textures
        var canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        var texUrl = fnTex(d);
        gl.atmosphere = fnAtmosphere(d);
        gl.textures.base = THREE.ImageUtils.loadTexture(texUrl, null, function(){

            // Once textures are loaded, initialize WebGL for this globe and start rendering loop
            d3gl.mouseEventCallback(function(gl, evt) {
                evt.latlon = intersect(gl, evt);
            });
            d3gl.init(gl);

            // Add globe-specific WebGL elements to scene
            initGlobeGL(gl);

            // Add canvas to DOM
            gl.element.appendChild(gl.renderer.domElement);

            // Add update function
            d3gl.addEventHandler("update", updateOverlays);
            d3gl.addEventHandler("update", updateAnimations);
            d3gl.addEventHandler("update", updateTransparency);
            d3gl.addEventHandler("update", updateMatrices);

            // Start rendering loop
            globeRender(gl);
        });
    }
    // called 60 times per second
    function globeRender(gl) {
        d3gl.update(gl);

        // For primitives such as heatmap that we don't want to update
        // per frame but rather when manually called
        if (update) {
          console.log(update);
          gl.update = {
            'heatmap': true
          };
          update--;
        }
        d3gl.fireEvent("update", gl);

        //gl.scene.overrideMaterial = true;
        gl.renderer.sortObjects = false;
        gl.renderer.sortElements = false;
        gl.renderer.render(gl.scene, gl.camera);

        requestAnimationFrame(function() { globeRender(gl);});
    }

    // sets up a ThreeJS globe
    function initGlobeGL(gl){
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
        gl.scene.add(sphereBack);
        gl.scene.add(sphere);

        // atmospheric effects
        var atmosphereMaterial = initAtmosphereMaterial(gl);
        var atmosphere = new THREE.Mesh(geom, atmosphereMaterial);
        atmosphere.scale.x = 1.1;
        atmosphere.scale.y = 1.1;
        atmosphere.scale.z = 1.1;
        gl.scene.add(atmosphere);

        // add a point light
        var pointLight = new THREE.PointLight( 0xFFFFFF );
        pointLight.position.x = 1;
        pointLight.position.y = 5;
        pointLight.position.z = 13;
        gl.scene.add(pointLight);

        if(!sphere || !canvas || !sphereMaterial.uniforms || !gl.renderer || !gl.scene || !gl.camera){
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
    }


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

    /** MOUSE EVENT RELATED **/

    // Turns a mouse event into a [lat, lon] pair,
    // or returns null if the mouse isn't over the globe.
    function intersect(gl, evt) {
        // cast a ray through the mouse
        var vector = new THREE.Vector3(
            (evt.offsetX / d3gl.width())*2 - 1,
            -(evt.offsetY / d3gl.height())*2 + 1,
            1.0
        );
        gl.projector.unprojectVector(vector, gl.camera);
        var raycaster = new THREE.Raycaster(
            gl.camera.position,
            vector.sub(gl.camera.position).normalize()
        );
        
        var intersected = raycaster.intersectObjects(gl.meshes.globe);
        if (intersected.length === 0) return null;
        var point = intersected[0].point;

        // phi is the angle from the y (up) axis, range [0, pi]
        // theta is the angle from the x axis in the x-z plane, range [-pi, pi]
        var theta, phi, lat, lon;
        phi = Math.acos(point.y);
        theta = Math.atan(point.x / point.z);

        // TODO: make plane and generalize offsets such as 90 and -90
        lat = 90 - phi*180/Math.PI + d3gl.rotation.lat;
        lon = -90 + theta*180/Math.PI + d3gl.rotation.lon;

        while(lon < -180) lon += 360;
        while(lon > 180) lon -= 360;
        while(lat < -90) lat += 360;
        while(lat > 270) lat -= 360;
        if(lat > 90) lat = 180 - lat;
        if(lat < -90 || lat > 90 || lon < -180 || lon > 180) throw "lat/lon error "+lat+"/"+lon;

        return [lat, lon];
    }

    /** UPDATE FUNCTIONS **/
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
    function updateOverlays(gl) {
        // now update/create the 3D overlays
        for(var i = 0; i < overlay3D.length; i++) {
            overlay3D[i](gl);
        }
    
        // draw the 2D (texture) overlays
        var context = gl.overlayCanvas.getContext("2d");
        context.setTransform(1,0,0,1,0,0); // identity
        context.width = gl.overlayCanvas.width;
        context.height = gl.overlayCanvas.height;
        context.clearRect(0,0,context.width,context.height);
        for(var i = 0; i < overlayTex.length; i++){
            overlayTex[i](gl, context);
        }
        gl.textures.overlay.needsUpdate = true; // tell 3js to update
    }
    function updateTransparency(gl) {
        if(fnTransparency) {
          gl.uniforms.transparency.value = fnTransparency(gl.datum);
        }
    }
    function updateMatrices(gl) {
        Object.keys(gl.meshes).forEach(function(key) {
            var meshes = gl.meshes[key];
            meshes.forEach(function(m) {
                m.matrixAutoUpdate = false;
                m.rotation.x = d3gl.rotation.lat*Math.PI/180 + m.orientation.x; 
                m.rotation.y = -d3gl.rotation.lon*Math.PI/180 + m.orientation.y;
                m.updateMatrix();
            });
        });
    }


    // *** PROPERTIES
    globe.width = function(val){
        var ret = d3gl.width(val);
        return ret ? ret : globe;
    }
    globe.height = function(val){
        var ret = d3gl.height(val);
        return ret ? ret : globe;
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
    };
    globe.on = function(eventName, callback){
        d3gl.addEventHandler(eventName, callback);
        return globe;
    };
    globe.rotation = function(latlon){
        if(!arguments.length) return rotation;
        if(!latlon || !latlon.lat || !latlon.lon) throw "Invalid rotation()";
        rotation = latlon;
        return globe;
    };
    globe.zoom = function(z){
        if(!arguments.length) return d3gl.zoom();
        if(!z || z<0) throw "Invalid zoom()";
        d3gl.zoom(z);
        return globe;
    };
    globe.update = function() {
        update = numGlobes;
    };

    // *** FUNCTIONS
    globe.rotateTo = function(latlon, ms){
        console.log("rotateTo(["+latlon.join(",")+"], "+ms+")");
        if(!ms) ms = 400; // same defaults as jquery
        else if(ms=="fast") ms = 200;
        else if(ms=="slow") ms = 600;

        anim.rotation = {
            start:d3gl.rotation,
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
        function shapes(gl, context){
            gl.uniforms.lookupShapes.value = 1;

            // load id map texture
            if(!idMapUrl) throw "The id map for shapes has not been defined.";
            if(gl.uniforms.texShapes.value==0) {
                // If in the process of loading, set flag so that texture won't load again
                gl.uniforms.texShapes.value = 1;
                loadIdMap(gl);
            }

            // iterate over data elements and create data texture
            var array = fnData(gl.datum);
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
     * * latitude
     * * longitude
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
        function points(gl, context){
            // render the points into a texture that goes on the globe
            var array = fnData(gl.datum);
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

    //TODO: Bug. When dragging left and right, bars migrate. When dragging
    // up and down, bars are fine.
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
        function bars(gl){
            // If user has changed data element, remove previous bars
            removePreviousBars(gl, gl.datum);

            // Update transition state
            bars.transition.update();

            // reeval every bar, at 60fps
            var array = fns.fnData(gl.datum);
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
                    bar = new THREE.Mesh(
                        new THREE.CubeGeometry(1, 1, 1),
                        new THREE.MeshBasicMaterial({
                            color: state.color
                        })
                    );
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
                bar.material.color = new THREE.Color(state.color);
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
        function arcs(gl){
            // reeval every arc, at 60fps
            var array = fnData(gl.datum);
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
        function painter(gl, context) {
            fnPaint(gl, context, fnData(gl.datum));
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

        var fnLat, fnLon; // returns latitude and longitude for data point
        var fnDensity; // takes data object and returns density [0, 1]
        var fnGradient; // gives back gradient stops for density

        var radius, blur;

        function heatmap(gl, context) {
            if(gl.update['heatmap']) {
                gl.update['heatmap'] = false;
                gl.heatCanvas = document.createElement("canvas"); // hidden canvas
                gl.gradientCanvas = document.createElement("canvas");
                gl.heatmapImg = renderHeatmap(gl, context, fnData(gl.datum));
            }
            context.drawImage(gl.heatmapImg, 0, 0, context.width, context.height);
        }

        function renderHeatmap(gl, context, data) {
            var rx = context.width;
            var ry = context.height;
            gl.heatCanvas.width = rx;
            gl.heatCanvas.height = ry;
            var heatContext = gl.heatCanvas.getContext("2d");
            heatContext.clearRect(0, 0, rx, ry);

            // set up gradient
            if(!gl.gradient) {
                gl.gradient = {};
                gl.gradient.stops = fnGradient ? fnGradient(gl.datum, gl.index) :
                  { 0.4: "rgb(0,0,255)", 0.5: "rgb(0,255,255)",
                    0.6: "rgb(0,255,0)", 0.8: "yellow", 0.95: "rgb(255,0,0)"};
                gl.gradient.length = gl.gradientCanvas.width = 100;
                gl.gradientCanvas.height = 10;
                var gradientContext = gl.gradientCanvas.getContext("2d");
                var linearGradient = gradientContext.createLinearGradient(0, 0, 100, 10);

                Object.keys(gl.gradient.stops).forEach(function(key) {
                    linearGradient.addColorStop(parseFloat(key), gl.gradient.stops[key]);
                });

                gradientContext.fillStyle = linearGradient;
                gradientContext.fillRect(0, 0, 100, 10);
                gl.gradient.data = gradientContext.getImageData(0, 5, 100, 5).data;
            }
            
            // set shadow properties
            if(!radius) radius = 0.01*rx; // default radius is 1% of width
            if(!blur) blur = radius;
            heatContext.shadowOffsetX = 20000;
            heatContext.shadowOffsetY = 20000;
            heatContext.shadowBlur = blur;

            // for each data, draw a shadow
            data.forEach(function(d) {
                // get properties for data element
                var lat = parseFloat(fnLat(d));
                var lon = parseFloat(fnLon(d));
                var density = fnDensity(d);
                if (density > 1) density = 0.99;

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
                    var offset = (Math.floor(gl.gradient.length * density))*4;
                    pixels.data[idx] = gl.gradient.data[offset];
                    pixels.data[idx + 1] = gl.gradient.data[offset + 1];
                    pixels.data[idx + 2] = gl.gradient.data[offset + 2];
                }
            }
            heatContext.clearRect(0, 0, rx, ry);
            heatContext.putImageData(pixels, 0, 0);

            var map = new Image();
            map.src = gl.heatCanvas.toDataURL("image/png");
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

        heatmap.blur = function(val) {
            if(arguments.length == 0) return blur;
            blur = val;
            return heatmap;
        }

        heatmap.gradient = function(val) {
            if(arguments.length == 0) return fnGradient;
            if(typeof val == "function") fnGradient = val;
            else fnGradient = function(){return val;};
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

d3.gl.model = function() {
    var d3gl = d3.gl();

    // *** PRIVATE
    var shaders = {}; // hardcoded strings, see bottom
    var fnMesh, fnTex, fnColor, fnMaterial, fnScale;

    // boolean array to indicate whether the model at index i
    // should have its materials updated according to the
    // fnTex and fnColor functions defined by model.texture and
    // model.color, respectively.
    var updateMaterials = [];

    var DEFAULT_MATERIAL_PARAMS = {
        "colorAmbient" : [0.4, 0.4, 0.4],
        "colorDiffuse" : [0.6, 0.6, 0.6],
        "colorSpecular" : [1.0, 1.0, 1.0],
        "specularCoef" : 0.0,
        "transparency" : 1.0
    };

    function model(g) {
        g.each(modelInit);
    }

    function modelInit(d, i) {
        // validate 
        if(this.tagName == "canvas") throw "D3GL creates its own canvas elements. "+
            "Render into a <div>, not directly into a <canvas>."

        // gl stores all the rendering state for each individual model.
        // remember that a call to d3.gl.model() may result in multiple model (one per datum)
        var gl = {};
        gl.element = this; // the D3 primitive: one dom element, one datum
        gl.datum = d;
        gl.index = i;

        var meshUrl = fnMesh && fnMesh(d);
        if (!meshUrl) {
            throw "Please provide a valid URL for the mesh for the model.";
        }
        gl.loader = new THREE.JSONLoader();
        gl.loader.load(meshUrl, function(g, m) {
            gl.obj = {};
            gl.obj.geometry = g;
            gl.obj.materials = m;
            gl.obj.scale = fnScale ? fnScale(d) : 1.;

            // Init WebGL elements for this model
            d3gl.init(gl);

            initLights(gl); // set up scene, transform, etc

            initModel(gl); // pre-process model for display and add to scene
            gl.element.appendChild(gl.renderer.domElement);

            // Register update function
            d3gl.addEventHandler("update", updateModelMaterials);

            // Start rendering loop for model
            modelRender(gl);
        });

    }
    // Called per frame
    function modelRender(gl) {
        // update
        d3gl.update(gl);
        d3gl.fireEvent("update", gl);

        // appropriately rotate & zoom
        /*
        gl.model.rotation.x = d3gl.rotation.lat*Math.PI/180; 
        gl.model.rotation.y = -d3gl.rotation.lon*Math.PI/180;
        gl.model.updateMatrix();
        */
				gl.model.matrix.copy(d3gl.rotationMatrix);
				gl.model.matrix.multiply(gl.model.adjustedMatrix);
				gl.model.matrixWorldNeedsUpdate = true;

        // render scene
        gl.renderer.render(gl.scene, gl.camera);
        
        // schedule next render
        requestAnimationFrame(function() { modelRender(gl); });
    }

    function updateModelMaterials(gl) {
        // Only update materials if fnTex is defined by user and
        // either the updateMaterials is undefined (which means that
        // user called TEXTURE before models were initialized with data,
        // or if updateMaterials is set to true by the TEXTURE function.
        var shouldUpdateMaterials = 
            (updateMaterials[gl.index] === undefined ||
              updateMaterials[gl.index]);

        if (!shouldUpdateMaterials) return;

        // If user wants to swap a material,
        // re-initialize the model with swapped materials created
        // from the user-defined texture. 
        for (var mIdx = 0; mIdx < gl.obj.materials.length; mIdx++) {
            var params = {};

            var texUrl = fnTex && fnTex(gl.datum, gl.index, mIdx);
            if (texUrl) params['mapDiffuse'] = texUrl;

            var color = fnColor && fnColor(gl.datum, gl.index, mIdx);
            if (color) params['colorDiffuse'] = color;

            var material = fnMaterial && fnMaterial(dl.datum, gl.index, mIdx);
            if (material) {
                $.extend(params, material);
            }
            
            // Try to get a full set of material params constructed
            // from user-defined values. If successful, swap the
            // material at the current material index for this model.
            var materialParams = getMaterialParams(params);
            if (materialParams) {
                gl.obj.materials[mIdx] = gl.loader.createMaterial(
                    materialParams,
                    "." // relative path is current directory for url
                );
            }
            
        }

        // Set fnTex back to null so that we don't apply the
        // same changes again and again per frame.
        updateMaterials[gl.index] = false;

        // Remove old model and add newly initialized one.
        gl.scene.remove(gl.model);
        initModel(gl, gl.model.adjustedMatrix); // Don't translate vertices again
    }

    // *** INIT FUNCTIONS
    function initLights(gl) {
        gl.scene.add( new THREE.AmbientLight(0xdddddd) );

        var directionalLight = new THREE.DirectionalLight(0xcccccc);
        directionalLight.position.x = 0;
        directionalLight.position.y = 0.5;
        directionalLight.position.z = 4;
        directionalLight.position.normalize();
        gl.scene.add( directionalLight );

        var pointLight = new THREE.PointLight(0x333333);
        pointLight.position = directionalLight.position;
        gl.scene.add(pointLight);
    }

    function initModel(gl, adjustedMatrix) {
				console.log("Initializing model!");
        gl.model = new THREE.Mesh(gl.obj.geometry,
            new THREE.MeshFaceMaterial(gl.obj.materials));
        gl.model.matrixAutoUpdate = false;

        // find appropriate scale for object
        d3gl.scaleModel(gl.model, fnScale ? fnScale(d) : 1., gl);

        // Translate to center model in viewport
        if (!adjustedMatrix) {
					d3gl.centerModel(gl.model, gl);
					gl.model.adjustedMatrix = new THREE.Matrix4().copy(gl.model.matrix);
				} else {
					gl.model.adjustedMatrix = new THREE.Matrix4().copy(adjustedMatrix);
				}
        
        gl.scene.add(gl.model); 
    }

    // TODO: this does nothing right now. Find a use for model intersection
    function intersect(gl, evt) {
        // cast a ray through the mouse
        var vector = new THREE.Vector3(
            (evt.offsetX / d3gl.width())*2 - 1,
            -(evt.offsetY / d3gl.height())*2 + 1,
            1.0
        );
        gl.projector.unprojectVector(vector, gl.camera);
        var raycaster = new THREE.Raycaster(
            gl.camera.position,
            vector.sub(gl.camera.position).normalize()
        );
        
        /*
        var intersected = raycaster.intersectObject(gl.model);
        if(intersected) {
            //intersected[0].object.material.materials[0].emissive.setHex( 0xff0000 )
        }
        */
    }

    // *** HELPER FUNCTIONS 

    /**
     * Given a texture path, returns the object with auto-filled params
     * that is readily passed into the createMaterial function to swap
     * the material of the model at a particular index with the texture
     * as the diffuse map.
     */
    function getMaterialParams(params) {
        if (Object.keys(params).length === 0) return null; 
        return $.extend({}, DEFAULT_MATERIAL_PARAMS, params);
    }

    // *** PROPERTIES
    model.width = function(val){
        var ret = d3gl.width(val);
        return ret ? ret : model;
    };
    model.height = function(val){
        var ret = d3gl.height(val);
        return ret ? ret : model;
    };
    model.mesh = function(val){
        if(!arguments.length) return fnMesh;  
        if(typeof val === "function") fnMesh = val;
        else fnMesh = function(){return val;}
        return model;
    };
    model.scale = function(val){
        if(!arguments.length) return fnScale;  
        if(typeof val === "function") fnScale = val;
        else fnScale = function(){return val;}
        return model;
    };
    model.rotation = function(latlon){
        if(!arguments.length) return rotation;
        if(!latlon || !latlon.lat || !latlon.lon) throw "Invalid rotation()";
        rotation = latlon;
        return model;
    };
    model.zoom = function(z){
        if(!arguments.length) return d3gl.zoom();
        if(!z || z<0) throw "Invalid zoom()";
        d3gl.zoom(z);
        return model;
    };
    /** Functions to swap materials for the model. The
        functions passed in as args take 3 args:
        datum, datumIndex, and materialIndex. 

        One model has one datum and datumIndex. The model may
        have many different materials that are indexed according
        to the order they are defined in the model's JSON format.
        Models that are not uv-mapped will not properly display
        texture even if specified with model.texture. **/

    // The function passed in should take three arguments and
    // return the texture path as a string.
    model.texture = function(val) {
        if(!arguments.length) return fnTex;  
        if(typeof val === "function") fnTex = val;
        else fnTex = function() { return val; };

        // We don't want to update materials for every frame.
        // So we set a flag per datum, which is toggled off
        // after the updates are made.
        for (var i = 0; i < updateMaterials.length; i++) {
          updateMaterials[i] = true;
        }
        return model;
    };
    // The function passed in should take three arguments and
    // return the color [r, g, b] where 0 <= r,g,b <= 1
    model.color = function(val) {
        if(!arguments.length) return fnColor;
        if(typeof val === "function") fnColor = val;
        else fnColor = function(){return val;}

        for (var i = 0; i < updateMaterials.length; i++) {
          updateMaterials[i] = true;
        }
        return model;
    };
    // The function passsed in takes three arguments and returns
    // an object with appropriate materials params as specified
    // in the THREE.js JSON format.
    // An example return value would be:
    // {'colorSpecular': [0.3, 0.3, 0.3], 'colorDiffuse': [0.5, 0.5, 0.5]}
    model.material = function(val) {
        if(!arguments.length) return fnMaterial;
        if(typeof val === "function") fnMaterial = val;
        else fnMaterial = function(){return val;}

        for (var i = 0; i < updateMaterials.length; i++) {
          updateMaterials[i] = true;
        }
        return model;
    };
    /** **/
    model.on = function(eventName, callback){
        d3gl.addEventHandler(eventName, callback);
        return model;
    }

    // *** PRIMITIVES

    // painter TODO: this is out of date. Update with new JSON format
    model.painter = function() {
        var fnData = function(d) { return d; };
        var fnPaint, img;
        function painter(gl, context, datum) {
            fnPaint(gl, context, fnData(datum));
        }
        painter.paint = function(val) {
            if(arguments.length == 0) return fnPaint;
            if(typeof val == "function") {
                fnPaint = val;
            } else if(typeof val == "string") {
                img = new Image();
                img.crossOrigin = '';
                img.src = val;
                fnPaint = function(gl, context, data) {
                    if(img.complete) context.drawImage(img, 0, 0);
                };
            } else {
                throw "The argument to paint should either be a canvas-rendering function" +
                    " or a string that is the url of a texture";
            }
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

    shaders.model = {};
    shaders.model.vertex = [
"// texture coordinate for vertex to be interpolated and passed into",
"// fragment shader per fragment",
"varying vec2 vUv;",
"",
"void main() {",
"    vUv = uv;",
"    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1);",
"}"
].join("\n");
    shaders.model.fragment = [
"varying vec2 vUv;",
"uniform sampler2D texBase;    // background texture",
"uniform sampler2D texOverlay; // canvas overlay texture",
"",
"void main() {",
"    vec4 overlay = texture2D(texOverlay, vUv);",
"    gl_FragColor = texture2D(texBase, vUv);",
"    gl_FragColor = mix(gl_FragColor, overlay, overlay.a);",
"}",
].join("\n");

    return model;
};

d3.gl.graph = function() {
    var d3gl = d3.gl();
    var overlay3D = [];

    var graph = function(g) {
        g.each(graphInit);
    };
    
    function graphInit(d, i) {
        // gl stores all the rendering state for each individual model.
        // remember that a call to d3.gl.model() may result in multiple model (one per datum)
        var gl = {};
        gl.element = this; // the D3 primitive: one dom element, one datum
        gl.datum = d;
        gl.index = i;
        gl.update = {
          'points': true,
          'lines': true,
          'axis': true
        };
        gl.updateGraph = true;

        // Pass in true for orthographic perspective
        //d3gl.init(gl, true);
        d3gl.init(gl);

        gl.graph = new THREE.Object3D();
        gl.graph.matrixAutoUpdate = false;

        Object.keys(gl.update).forEach(function(key) {
          gl.update[key] = true;
        });
        overlay3D.forEach(function(overlayFn) {
            overlayFn(gl);
        });

        d3gl.scaleModel(gl.graph, 1, gl);
        d3gl.centerModelByWeight(gl.graph, gl);
        gl.graph.adjustedMatrix = new THREE.Matrix4().copy(gl.graph.matrix);

        gl.graph.children.forEach(function(child) {
            d3gl.scaleModel(child, 1, gl);
            d3gl.centerModel(child, gl);
        });

        gl.scene.add(gl.graph);

        // Add canvas to DOM
        gl.element.appendChild(gl.renderer.domElement);
        graphRender(gl);
    }
    function graphRender(gl) {
        d3gl.update(gl);
        d3gl.fireEvent("update", null);
        
        // Update rotation
        gl.graph.matrix.copy(d3gl.rotationMatrix);
        gl.graph.matrix.multiply(gl.graph.adjustedMatrix);
        gl.graph.matrixWorldNeedsUpdate = true;

/*
        Object.keys(gl.meshes).forEach(function(key) {
            gl.meshes[key].forEach(function(m) {
								m.matrix.copy(d3gl.rotationMatrix);
								m.matrix.multiply(m.adjustedMatrix);
                m.matrixWorldNeedsUpdate = true;
            }); 
        });
        */

        gl.renderer.render(gl.scene, gl.camera);
        requestAnimationFrame(function() { graphRender(gl);});
    }
    graph.width = function(val) {
        var ret = d3gl.width(val);
        return ret ? ret : graph;
    };
    graph.height = function(val) {
        var ret = d3gl.height(val);
        return ret ? ret : graph;
    };
    graph.zoom = function(z){
        if(!arguments.length) return d3gl.zoom();
        if(!z || z<0) throw "Invalid zoom()";
        d3gl.zoom(z);
        return graph;
    };
    graph.orient = function(val) {
      d3gl.orient(val);
      return graph;
    };
    /*
    graph.update = function() {
      updateGraph = true;
    };
    */


    graph.points = function() {
        /** User-defined callback functions **/
        var fnScale, fnColor, fnSize;
        var fnData = function(d) { return d; };
        var fnVertex = function(d) { return d; };

        var points = function(gl) {
            if (gl.update['points']) {
              gl.update['points'] = false;
              initPoints(gl);
            }
            // TODO: what if user updates colors, etc?
        };

        function initPoints(gl) {
            var dataArray, scale, geometry, material, texture, pointcloud;
            if (!fnData || !(dataArray = fnData(gl.datum, gl.index))) {
                throw "Please specify point cloud data using pointcloud.data";
            }
            scale = fnScale ? fnScale(gl.datum, gl.index) : 1;

            geometry = new THREE.Geometry();
            geometry.colors = [];
            dataArray.forEach(function(datum, vIdx) {
                var vertex = fnVertex(datum);
                geometry.vertices.push(new THREE.Vector3(
                    parseFloat(vertex.x), parseFloat(vertex.y), parseFloat(vertex.z)));
                // TODO: following shouldn't use gl.datum it should use datum
                geometry.colors.push(new THREE.Color(
                    fnColor ? fnColor(datum, vIdx) : 0x000000));
            });
            texture = new THREE.Texture(generatePointTexture());
            texture.needsUpdate = true;

            material = new THREE.ParticleBasicMaterial({
                'vertexColors': true,
                'size': fnSize ? fnSize() : 50,
                'sizeAttenuation': false,
                'map': texture,
                'depthTest': false,
                'transparent': true,
                'opacity': 0.7
            });

            pointcloud = new THREE.ParticleSystem(geometry, material);
            //TODO: only sort particles when less than some threshold
            if (geometry.vertices.length < 1000) {
              pointcloud.sortParticles = true;
            }
            pointcloud.matrixAutoUpdate = false;
            gl.graph.add(pointcloud);
        }
        function generatePointTexture() {
            // create canvas
            var size = 128;
            var canvas = document.createElement( 'canvas' );
            canvas.width = size;
            canvas.height = size;
            
            // draw circle
            var context = canvas.getContext( '2d' );
            var radius = size / 2;

            context.beginPath();
            context.arc(radius, radius, radius, 0, 2*Math.PI, false);
            context.fillStyle = "#fff";
            context.fill();

            return canvas;
        }

        points.scale = function(val) {
            if (arguments.length===0) return fnScale;
            if (typeof val === "function") fnScale = val;
            else fnScale = function() { return val; };
            return points;
        };
        points.data = function(val) {
            if (arguments.length===0) return fnData;
            if (typeof val === "function") fnData = val;
            else fnData = function() { return val; };
            return points;
        };
        points.vertex = function(val) {
            if (arguments.length===0) return fnVertex;
            if (typeof val === "function") fnVertex = val;
            else fnVertex = function() { return val; };
            return points;
        };
        points.color = function(val) {
            if (arguments.length===0) return fnColor;
            if (typeof val === "function") fnColor = val;
            else fnColor = function() { return val; };
            return points;
        };
        points.size = function(val) {
            if (arguments.length===0) {
              return fnSize;
            }
            if (typeof val === "function") {
              error("d3.gl.graph.points.size takes a scalar value.");
            } else {
              fnSize = function() { return val; };
            }
            return points;
        };

        overlay3D.push(points);
        return points;
    };

    graph.lines = function() {
        var fnData = function(d) { return d; };
        var fnVertices = function(d) { return d; };
        var fnColor, fnThickness, fnOpacity;

        var lines = function(gl) {
            if (!gl.update['lines']) return;
            gl.update['lines'] = false;

            var linesObject = new THREE.Object3D();
            var dataArray = fnData(gl.datum, gl.index);
            $.each(dataArray, function(index, datum) {
                var vertices = fnVertices(datum, index);
                var geometry, material, line, color, thickness;

                geometry = new THREE.Geometry();
                for (var i = 0; i < vertices.length; i += 3) {
                    var vertex = new THREE.Vector3(
                      parseFloat(vertices[i]),
                      parseFloat(vertices[i+1]),
                      parseFloat(vertices[i+2])
                    );
                    geometry.vertices.push(vertex);
                }

                // TODO use fnColor, fnThickness
                color = fnColor ?  new THREE.Color(fnColor(datum)) :
                  new THREE.Color(0x000000);
                thickness = fnThickness ? fnThickness(datum) : 2;
                opacity = fnOpacity ? fnOpacity(datum) : 1;
                material = new THREE.LineBasicMaterial({
                    'color': color,
                    'opacity': opacity,
                    'linewidth': thickness
                }); 
                
                // Create line and adjust model to fit viewport
                line = new THREE.Line(geometry, material);
                linesObject.add(line);
            });
            gl.graph.add(linesObject);
        };

        lines.data = function(val) {
            if (arguments.length===0) return fnData;
            if (typeof val === "function") fnData = val;
            else fnData = function() { return val; };
            return lines;
        };
        lines.vertices = function(val) {
            if (arguments.length===0) return fnVertices;
            if (typeof val === "function") fnVertices = val;
            else fnVertices = function() { return val; };
            return lines;
        };
        lines.color = function(val) {
            if (arguments.length===0) return fnColor;
            if (typeof val === "function") fnColor = val;
            else fnColor = function() { return val; };
            return lines;
        };
        lines.thickness = function(val) {
            if (arguments.length===0) return fnThickness;
            if (typeof val === "function") fnThickness = val;
            else fnThickness = function() { return val; };
            return lines;
        };
        lines.opacity = function(val) {
            if (arguments.length===0) return fnOpacity;
            if (typeof val === "function") fnOpacity = val;
            else fnOpacity = function() { return val; };
            return lines;
        };

        overlay3D.push(lines);
        return lines;
    };

    /** AXIS **/
    //TODO: make ticks and label separate closures under axis
    // make tick & label size in terms of pointcloud dimensions
    // (i.e. scale it with gl.scale)
    graph.axis = function() {
        var axisUpdate = true;
        var fnData = function(d) { return d; };
        var fnScale, fnOrient, fnThickness, fnOffset, fnColor;
        var fnTicks;
        var ticksRenderer, labelRenderer;

        // Called once per frame
        var axis = function(gl) {
            if (!gl.update['axis']) return;
            gl.update['axis'] = false;

            // Num data elements = num axes for graph
            var data = fnData(gl.datum);

            // For each axis, create and add meshes to scene
            data.forEach(function(datum) {
                var orient, scale, p0, p1, offset;
                orient = fnOrient(datum);
                scale = fnScale(datum);
                p0 = scale.domain()[0];
                p1 = scale.domain()[1];

                // The offset corresponding to the line's orientation
                // will be ignored.
                offset = fnOffset ? fnOffset(datum) : {"x": 0, "y": 0, "z": 0};

                /* Create axis as line */
                drawLine(gl, datum, offset);

                /* Create tick marks as particles with texture */ 
                var drawTicks = fnTicks ? fnTicks(datum) : true;
                if(drawTicks && ticksRenderer) ticksRenderer(gl, datum, offset);

                /* Create a label for the axis */
                if(drawTicks && labelRenderer) labelRenderer(gl, datum, offset);
            });
        };
        function drawLine(gl, datum, offset) {
            var orient, scale, p0, p1, color;
            orient = fnOrient(datum);
            scale = fnScale(datum);
            p0 = scale.domain()[0];
            p1 = scale.domain()[1];
            color = fnColor ? fnColor(datum) : 0x000000;

            var lineGeometry, v0, v1, lineMaterial, line;
            
            // Line lineGeometry
            lineGeometry = new THREE.Geometry();
            lineGeometry.vertices.push(getPointOnAxis(gl, orient, p0, offset));
            lineGeometry.vertices.push(getPointOnAxis(gl, orient, p1, offset));

            // Line material
            lineMaterial = new THREE.LineBasicMaterial({
                'color': new THREE.Color(color),
                'opacity': 1,
                'linewidth': fnThickness ? fnThickness(datum) : 3
            }); 
            
            // Create and add line
            line = new THREE.Line(lineGeometry, lineMaterial);
						line.adjustedMatrix = new THREE.Matrix4().copy(line.matrix);
            line.matrixAutoUpdate = false;
            gl.graph.add(line);
        }
        function getPointOnAxis(gl, orient, p, offset) {
            if (!offset) {
              offset = {"x": 0, "y": 0, "z": 0};
            }
            var v = new THREE.Vector3(
                orient === "x" ? p : offset["x"],
                orient === "y" ? p : offset["y"],
                orient === "z" ? p : offset["z"]
            );
            return v;
        }
        function generateTickMarkTexture(tick, size, font, color) {
            // create canvas
            size = size ? size : 64;
            var canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            
            var context = canvas.getContext( '2d' );

            context.fillStyle = color ? color : "#000";
            context.font = font ? font : "bold 16px Arial";
            context.fillText(tick, size/3, size/3);

            return canvas;
        }
        axis.data = function(val) {
            if (arguments.length===0) return fnData;
            if (typeof val === "function") fnData = val;
            else fnData = function() { return val;};
            return axis;
        };
        // val = function(datum, index) {
        //    return d3.scale
        // }
        axis.scale = function(val) {
            if (arguments.length===0) return fnScale;
            if (typeof val === "function") fnScale = val;
            else fnScale = function() { return val;};
            return axis;
        };
        // val = function(datum, index) {
        //    return {"x"|"y"|"z"}
        // }
        axis.orient = function(val) {
            if (arguments.length===0) return fnOrient;
            if (typeof val === "function") fnOrient = val;
            else fnOrient = function() { return val;};
            return axis;
        };
        axis.color = function(val) {
            if (arguments.length===0) return fnColor;
            if (typeof val === "function") fnColor = val;
            else fnColor = function() { return val;};
            return axis;
        };
        axis.thickness = function(val) {
            if (arguments.length===0) return fnThickness;
            if (typeof val === "function") fnThickness = val;
            else fnThickness = function() { return val;};
            return axis;
        };
        axis.offset = function(val) {
            if (arguments.length===0) return fnOffset;
            if (typeof val === "function") fnOffset = val;
            else fnOffset = function() { return val;};
            return axis;
        };
        axis.drawTicks = function(val) {
            if (arguments.length===0) return fnTicks;
            if (typeof val === "function") fnTicks = val;
            else fnTicks = function() { return val;};
            return axis;
        };

        /** TICKS on axis **/
        axis.ticks = function() {
            var fnCount, fnFormat, fnSize,
                fnFont, fnResolution, fnColor;
            //TODO fnValues

            var ticks = function(gl, datum, offset) {
                var orient, scale, ticks, count, tickMarks;
                orient = fnOrient(datum);
                scale = fnScale(datum);

                // TICKS should be an array of tick marks on the axis
                // ex) [-1, 0, 1]
                ticks = scale.ticks(fnCount(datum));
                console.log(ticks);
                ticks.splice(0, 1);
                console.log(ticks);

                // tickMarks is a group of tickMark meshes
                tickMarks = new THREE.Object3D();

                // For each tick, create a tick mesh (a particle system with one
                // particle) and add it to tickMarks
                ticks.forEach(function(tick) {
                    var tickMark, tickTex, mesh, size, font, color;
                    
                    // Format tick if user has specified a formatting function
                    if (fnFormat) tick = fnFormat(tick);

                    tickMark = new THREE.Geometry();
                    tickMark.vertices = [getPointOnAxis(gl, orient, tick, offset)];

                    if (fnResolution) tickResolution = fnResolution(datum);
                    if (fnFont) font = fnFont(datum);
                    if (fnColor) color = fnColor(datum);
                    tickTex = new THREE.Texture(generateTickMarkTexture(
                        tick, tickResolution, font, color));
                    tickTex.needsUpdate = true;

                    if (fnSize) size = fnSize(datum);
                    mesh = new THREE.ParticleSystem(tickMark,
                        new THREE.ParticleBasicMaterial({
                            'size': size,
														'sizeAttenuation': false,
                            'map': tickTex,
                            'transparent': true,
                            'depthTest': false
                        })
                    );
                    tickMarks.add(mesh);
                });

								tickMarks.adjustedMatrix = new THREE.Matrix4().copy(
									tickMarks.matrix);
                tickMarks.matrixAutoUpdate = false;
                gl.graph.add(tickMarks);
            };

            ticks.count = function(val) {
                if (arguments.length===0) return fnCount;
                if (typeof val === "function") fnCount = val;
                else fnCount = function() { return val;};
                return ticks;
            };
            ticks.format = function(val) {
                if (arguments.length===0) return fnFormat;
                if (typeof val === "function") fnFormat = val;
                else fnFormat = function() { return val;};
                return ticks;
            };
            ticks.size = function(val) {
                if (arguments.length===0) return fnSize;
                if (typeof val === "function") fnSize = val;
                else fnSize = function() { return val;};
                return ticks;
            };
            ticks.resolution = function(val) {
                if (arguments.length===0) return fnResolution;
                if (typeof val === "function") fnResolution = val;
                else fnResolution = function() { return val;};
                return ticks;
            };
            ticks.font = function(val) {
                if (arguments.length===0) return fnFont;
                if (typeof val === "function") fnFont = val;
                else fnFont = function() { return val;};
                return ticks;
            };
            ticks.color = function(val) {
                if (arguments.length===0) return fnColor;
                if (typeof val === "function") fnColor = val;
                else fnColor = function() { return val;};
                return ticks;
            };
            
            ticksRenderer = ticks;
            return ticks;
        };

        axis.label = function() {
            var fnText, fnSize, fnResolution, fnFont, fnColor;

            var label = function(gl, datum, offset) {
                var orient, scale, p0, p1;
                orient = fnOrient(datum);
                scale = fnScale(datum);
                p0 = scale.domain()[0];
                p1 = scale.domain()[1];

                var label, labelGeometry, labelTex, labelMesh;
                label = fnText ? fnText(datum) : orient;

                labelGeometry = new THREE.Geometry();
                labelGeometry.vertices = [getPointOnAxis(gl, orient, p1, offset)];

                var labelResolution, labelFont, labelColor;
                if (fnResolution) labelResolution = fnResolution(datum);
                if (fnFont) labelFont = fnFont(datum);
                if (fnColor) labelColor = fnColor(datum);
                labelTex = new THREE.Texture(generateTickMarkTexture(
                  label, labelResolution, labelFont, labelColor));  
                labelTex.needsUpdate = true;

                labelMesh = new THREE.ParticleSystem(labelGeometry,
                    new THREE.ParticleBasicMaterial({
                        'size': fnSize ? fnSize(datum) : 50,
												'sizeAttenuation': false,
                        'map': labelTex,
                        'transparent': true,
                        'depthTest': false
                    })
                );
								labelMesh.adjustedMatrix = new THREE.Matrix4().copy(labelMesh.matrix);
                labelMesh.matrixAutoUpdate = false;
                gl.graph.add(labelMesh);
            };
            label.text = function(val) {
                if (arguments.length===0) return fnText;
                if (typeof val === "function") fnText = val;
                else fnText = function() { return val;};
                return label;
            }
            label.size = function(val) {
                if (arguments.length===0) return fnSize;
                if (typeof val === "function") fnSize = val;
                else fnSize = function() { return val;};
                return label;
            };
            label.resolution = function(val) {
                if (arguments.length===0) return fnResolution;
                if (typeof val === "function") fnResolution = val;
                else fnResolution = function() { return val;};
                return label;
            };
            label.font = function(val) {
                if (arguments.length===0) return fnFont;
                if (typeof val === "function") fnFont = val;
                else fnFont = function() { return val;};
                return label;
            };
            label.color = function(val) {
                if (arguments.length===0) return fnColor;
                if (typeof val === "function") fnColor = val;
                else fnColor = function() { return val;};
                return label;
            };
            label.text = function(val) {
                if (arguments.length===0) return fnText;
                if (typeof val === "function") fnText = val;
                else fnText = function() { return val;};
                return label;
            };

            labelRenderer = label;
            return label;
        };

        overlay3D.push(axis);
        return axis;
    };

    return graph;
};
