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
    // PUBLIC PROPERTIES
    // viewport dimensions, in pixels
    var width = 400;
    var height = 400;
    // callbacks (globe-level. see shapes(), points(), etc)
    var fnTex;
    // event handlers
    var eventHandlers = {
        'mousedown':[],
        'mousemove':[],
        'mouseup':[],
        'click':[],
        'dblclick':[]
    };

    // PRIVATE VARS
    var zoom = 2.0, rotation = [0, 0]; // azith, angle
    // overlays. these are functions that either render onto the globe tex (eg colored countries),
    // or which run after the globe itself to draw additional 3D elements (eg arcs)
    var overlayTex = []; 
    var overlay3D = [];
    var gl = {};
	// constants
	var VIEW_ANGLE = 45,
	    NEAR = 0.01,
	    FAR = 100;
    var MOUSE_SENSITIVITY = [0.005, 0.005];
    var ZOOM_SENSITIVITY = 0.1; // (0 = no effect, 1 = infinite)
    var MIN_ZOOM = 0.5, MAX_ZOOM = 2;
    var COUNTRY_CODE_TEX = "../img/country-codes.png";

    var colorOverlayUtils = {
        loadShaders: function(callback) {
            var loaded = 0;
            $.get("../shaders/color_overlay_fs.glsl", function(fs) {
                overlayFs = fs;
                if(++loaded == 2) callback();
            });
            $.get("../shaders/color_overlay_vs.glsl", function(vs) {
                overlayVs = vs;
                if(++loaded == 2) callback();
            });
        },
        createMaterial: function(bgTexture, overlayTexture, additionalUniforms) {
            var vertexShader = overlayVs;
            var fragmentShader = overlayFs;
            var uniforms = {
                texture: {
                    type: "t",
                    value: THREE.ImageUtils.loadTexture(bgTexture)
                },
                overlay: {
                    type: "t",
                    value: overlayTexture
                },
            };
            $.extend(true, uniforms, additionalUniforms);
            var material = new THREE.ShaderMaterial({
                vertexShader: vertexShader,
                fragmentShader: fragmentShader,
                uniforms: uniforms,
            });
            return material;
        },
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

    // sets up a ThreeJS globe
    function initGL(gl, tex){
        gl.meshes = [];
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
        var texture = new THREE.Texture(canvas);
        sphereMaterial = colorOverlayUtils.createMaterial(tex, texture);

        // map view:
        //    sphereMaterial = choroplethUtils.createMaterial(tex);
        //    gl.uniforms = sphereMaterial.uniforms;
        // plain view:
        //    var texture = THREE.ImageUtils.loadTexture(tex);
        //    sphereMaterial = new THREE.MeshLambertMaterial({
        //        color: 0xffffff,
        //        map: texture
        //    });

        // create the actual globe
        var radius = 1.0, segments = 80, rings = 40;
        var sphere = new THREE.Mesh(
           new THREE.SphereGeometry(radius, segments, rings),
           sphereMaterial);
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

        gl.meshes.push(sphere);
        gl.overlayCanvas = canvas;
        gl.overlayTexture = texture;
        gl.uniforms = sphereMaterial.uniforms;
        gl.renderer = renderer;
        gl.scene = scene;
        gl.camera = camera;
        gl.projector = new THREE.Projector();
        gl.scene = scene;
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
        var lat = Math.asin(point.y) + rotation[0];
        var lon = Math.atan2(point.x, point.z) - rotation[1];
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
            rotation[1] += (evt.pageX - dragStart[0])*MOUSE_SENSITIVITY[0]*zoom;
            rotation[0] += (evt.pageY - dragStart[1])*MOUSE_SENSITIVITY[1]*zoom;
        }
    }

    // This is not quite as clean as
    // an external stylesheet, but simpler for
    // the end user.
    function initStyle(elem){
        elem.style.cursor = "pointer";
    }

    // renders. see http://bost.ocks.org/mike/chart/
    function globe(g){
        // render into each canvas
        g.each(function(d,i){
            var element = this;
            if(element.tagName == "canvas") throw "D3GL can only render into Canvas elements";
            var texture = fnTex(d);
            console.log("Rendering. "+
                "Dimensions: "+width+","+height+" "+
                "Texture: "+texture);

            function start() {
                // 3js state
                var gl = {};
                gl.datum = d;
                initGL(gl, texture);
                initControls(gl, gl.renderer.domElement);
                initStyle(gl.renderer.domElement);
                element.appendChild(gl.renderer.domElement);
                
                for(var i = 0; i < overlay3D.length; i++) {
                    overlay3D[i](d);
                }
                
                // called 60 times per second
                function render(){
                    // draw the texture
                    gl.overlayCanvas.width = gl.overlayCanvas.width;
                    for(var i = 0; i < overlayTex.length; i++){
                        overlayTex[i](gl.overlayCanvas, d);
                    }
                    gl.overlayTexture.needsUpdate = true;
                    
                    // draw the globe
                    for(var i = 0; i < gl.meshes.length; i++) {
                        gl.meshes[i].rotation.x = rotation[0];
                        gl.meshes[i].rotation.y = rotation[1];
                    }
                    gl.camera.position.z = 1+zoom;
                    gl.renderer.render(gl.scene, gl.camera);
                    requestAnimationFrame(render);
                }
                render();
            }

            colorOverlayUtils.loadShaders(function() {
                choroplethUtils.loadCountryCodeTexture(function(ev) {
                    choroplethUtils.codes = ev.target;
                    start();
                });
            });
        });
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
        if(typeof val === "function") fnTex = val;
        else fnTex = function(){return val;}
        return globe;
    }
    globe.on = function(eventName, callback){
        if(typeof(eventHandlers[eventName])==="undefined"){
            throw "unsupported event "+eventName;
        }
        eventHandlers[eventName].push(callback);
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
        function points(canvas, datum){
            // render the points into a texture that goes on the globe
            var context = canvas.getContext("2d"); 
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
                var pradius = radius * canvas.width / 360.0;
                var plat = canvas.height * (1-(lat + 90)/180);
                var plon = canvas.width * (lon + 180)/360;

                // scale to mitigate projection distortion
                var xscale = 1 / (Math.cos(lat*Math.PI/180) + 0.01);
                plon /= xscale;
                context.save();
                context.scale(xscale, 1.0);
                // draw it twice if on the the int'l date line to avoid clipping
                if(plon < pradius){
                    drawCircle(context, plat, plon + canvas.width/xscale, pradius, color);
                } else if(plon > canvas.width/xscale-pradius){
                    drawCircle(context, plat, plon - canvas.width/xscale, pradius, color);
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
        function bars(datum){
            console.log("wat");
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

            loadShaders(addBars);
            
            function loadShaders(callback) {
                var loaded = 0;
                $.get("../shaders/bars_fs.glsl", function(fs) {
                    barsFs = fs;
                    if(++loaded == 2) callback();
                });
                $.get("../shaders/bars_vs.glsl", function(vs) {
                    barsVs = vs;
                    if(++loaded == 2) callback();
                });
            }
            
            function addBars() {
                var lineMaterial = new THREE.ShaderMaterial({
                    vertexShader: barsVs,
                    fragmentShader: barsFs,
                    attributes: attributes,
                });

                var line = new THREE.Line(linesGeo, lineMaterial);
                line.type = THREE.Lines;
                gl.scene.add(line);
                gl.meshes.push(line);
            }

            return bars;
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
