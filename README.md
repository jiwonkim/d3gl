D3GL
====

A D3 plugin to display spatial data. Uses WebGL and ThreeJS.


Examples
--------

Option 1 - "Reusable Charts"
----------------------------

    d3.csv("rainfall.csv", function(data) {
        var rainMax = d3.max(data, function(d,i){return d.rainfall});
        var rainHeight = d3.scale.linear()
            // the domain is in inches of rain per year
            .domain([0, rainMax])
            // the range is in globe radii (0 = flush to the surface)
            .range([0,1]); 
        var rainColor = d3.scale.linear()
            .domain([0,rainMax]).range(["#b00","#0f0"]);

        var globe = d3.gl.globe().width(500).height(500).texture('outline')
            .latitude(function(d,i) { return d.lat; })
            .longitude(function(d,i) { return d.lon; })
            .bars(function(d,i){ return rainScale(d.rainfall); })
            .color(function(d,i){ return rainColor(d.rainfall); });
        d3.select("canvas").datum(data).call(globe);
    });


*Steps*
* Basic globe
* Continent textures
* Points
* Regions
* Circles
* Bars
* Arcs
* Paths
* Visuals (atmosphere, etc)
* Interaction (zoom and rotate)
* Selection

Option 2 - Data Bindings for GL Elements
----------------------------------------

    var d3gl = d3.gl("canvas");

    // POINT CLOUD 
    var points = [{x:10,y:10,z:10,color:"#f00"}, ...];
    var scale = d3gl.transform()
        .scale(d3gl.boundingbox(points), d3gl.unitcube());
    d3gl.selectAll("cube").enter().append("cube")
        .data(points).tranform(scale)
        .color(function(d){return d.color;})

    // basic types
    //      cube
    //      sphere
    //      vertices
    //      meshes
    // textures? texture cubes?
    // data animation?
    
    // static visualization...
    
    // camera animation
    d3gl.animate().zoom(2).rotate([10,90]);

    // standard mouse + keyboard controls
    d3gl.defaultCamera();


Utilities
---------
* *d3.gl.deg(radians)* returns degrees
* *d3.gl.s2c(r, theta, phi)* returns xyz coordinates
* *d3.gl.c2s(x, y, z)* returns spherical coordinates
* *d3.gl.transform()* for creating matrix transforms
* *d3.gl.regions()* for downloading country outlines

Demos
-----
* Global rainfall
* Global realtime flights
* Point cloud (Tikal)??
* CAD model??
* Minecraft??

Inspired by [Towards Reusable Charts](http://bost.ocks.org/mike/chart/).

Built with
----------
* [d3.js](http://mbostock.github.com/d3/)
* [jquery](http://jquery.com/)
* [mousewheel.jquery.js](http://brandonaaron.net/code/mousewheel/docs)
* [nasa blue marble](http://earthobservatory.nasa.gov/Features/BlueMarble/BlueMarble_monthlies.php) imagery
