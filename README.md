D3GL
====

A D3 plugin to display spatial data on a globe. Uses WebGL and ThreeJS.

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

API inspired by [Towards Reusable Charts](http://bost.ocks.org/mike/chart/).

Examples
--------
* [Hello World](http://bl.ocks.org/4056536)
* Global realtime flights
* Point cloud (Tikal)??
* CAD model??
* Minecraft??

Steps
-----
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

Built with
----------
* [d3.js](http://mbostock.github.com/d3/)
* [jquery](http://jquery.com/)
* [mousewheel.jquery.js](http://brandonaaron.net/code/mousewheel/docs)
* [nasa blue marble](http://earthobservatory.nasa.gov/Features/BlueMarble/BlueMarble_monthlies.php) imagery

<link rel="stylesheet" href="style.css"></link>
