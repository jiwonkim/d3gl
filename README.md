D3GL
====
**A D3 plugin to display spatial data on a globe.** Uses WebGL and ThreeJS.

    d3.csv("rainfall.csv", function(data) {
        var rainMax = d3.max(data, function(d,i){return d.rainfall});
        var rainHeight = d3.scale.linear()
            .domain([0, rainMax]) // inches of rain per year
            .range([0,1]); // globe radii (0 = flush to the surface)
        var rainColor = d3.scale.linear()
            .domain([0,rainMax]).range(["#b00","#0f0"]);

        var globe = d3.gl.globe()
            .width(500).height(500)
            .texture('img/countries.png')
            .bars()
                .latitude(function(d,i){ return d.lat; })
                .longitude(function(d,i){ return d.lon; })
                .height(function(d,i){ return rainScale(d.rainfall); })
                .color(function(d,i){ return rainColor(d.rainfall); });
        d3.select("canvas").datum(data).call(globe);
    });

API inspired by [Towards Reusable Charts](http://bost.ocks.org/mike/chart/).

<a href="http://github.com/jiwonkim/d3gl"><img style="position: absolute; top: 0; right: 0; border: 0;" src="http://s3.amazonaws.com/github/ribbons/forkme_right_red_aa0000.png" alt="Fork me on GitHub"></a>

Examples
--------
* [Hello World](http://bl.ocks.org/4056536)
* [Space Exploration](http://bl.ocks.org/4142482)
* [Earth's Climate](http://bl.ocks.org/4153053)
* [Earthquakes](http://bl.ocks.org/)

Built with
----------
* [d3.js](http://mbostock.github.com/d3/)
* [three.js](http://threejs.org/)
* [jquery](http://jquery.com/)
* [mousewheel.jquery.js](http://brandonaaron.net/code/mousewheel/docs)
* [nasa blue marble](http://earthobservatory.nasa.gov/Features/BlueMarble/BlueMarble_monthlies.php) imagery

<link rel="stylesheet" href="style.css"></link>
