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
    // viewport dimensions, in pixels
    var width = 500;
    var height = 500;
    // texture name
    var texture = 'continentoutlines';
    // callbacks. data => lat, lon, etc
    var fnLat, fnLon;
	// constants
	var VIEW_ANGLE = 45,
	    NEAR = 1,
	    FAR = 10000;

    // sets up a ThreeJS globe
    function initGL(gl){
        var scene = new THREE.Scene();

        // camera
        var camera = new THREE.PerspectiveCamera(
            VIEW_ANGLE, width/height,
            NEAR, FAR);
        camera.position.z = 1000;
        scene.add(camera);

        // globe model
        var sphereMaterial = new THREE.MeshLambertMaterial({
            color: 0xCC0000
        });
        var radius = 200, segments = 16, rings = 16;
        var sphere = new THREE.Mesh(
           new THREE.SphereGeometry(radius, segments, rings),
           sphereMaterial);
        scene.add(sphere);

        // add a point light
        var pointLight = new THREE.PointLight( 0xFFFFFF );
        pointLight.position.x = 100;
        pointLight.position.y = 500;
        pointLight.position.z = 1300;
        scene.add(pointLight);

        // start the renderer
        var renderer = new THREE.WebGLRenderer();
        renderer.setSize(width, height);

        gl.mesh = sphere;
        gl.renderer = renderer;
        gl.scene = scene;
        gl.camera = camera;
    }
    function initGL2(gl){
        gl.scene = new THREE.Scene();

        // camera
        gl.camera = new THREE.Camera( 75, width/height, 1, 10000 );
        gl.camera.position.z = 1000;
        gl.scene.add(gl.camera);

        // model
        var geometry = new THREE.CubeGeometry( 200, 200, 200 );
        var material = new THREE.MeshBasicMaterial( { color: 0xff0000, wireframe: true } );
        var mesh = new THREE.Mesh( geometry, material );
        gl.scene.add( mesh );

        // renderer
        gl.renderer = new THREE.WebGLRenderer({canvas:gl.canvas});
        gl.renderer.setSize( width, height );
    }

    // renders. see http://bost.ocks.org/mike/chart/
    function globe(g){
        // render into each canvas
        g.each(function(d,i){
            if(this.tagName == "canvas") throw "D3GL can only render into Canvas elements";
            console.log("Rendering. "+
                "Dimensions: "+width+","+height+" "+
                "Texture: "+texture);

            // 3js state
            var gl = {}; //{canvas:this};
            initGL(gl);
            $("#foo")[0].appendChild(gl.renderer.domElement);
            //$(this).html(gl.domElement);
            
            // called 60 times per second
            function render(){
                gl.mesh.rotation.x += 0.02;
                gl.mesh.rotation.y += 0.01;
                gl.renderer.render(gl.scene, gl.camera);
                requestAnimationFrame(render);
            }
            render();
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
        texture = val;
        return globe;
    }
    return globe;
};
