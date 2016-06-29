"use strict";

var _ = require("./lodash"),
    intersectNode = require("./intersect/intersect-node"),
    util = require("./util"),
    d3 = require("./d3");
module.exports = createEdgePaths;

function createEdgePaths(selection, g, arrows) {
  var svgPaths = selection.selectAll("g.edgePath")
    .data(g.edges(), function(e) { return util.edgeToId(e); })
    .classed("update", true);

  // Update the first point in the edge so it is shown in the correct category.
  adjustEdgeForCategories(g);

  enter(svgPaths, g);
  exit(svgPaths, g);

  util.applyTransition(svgPaths, g)
    .style("opacity", 1);

  // Save DOM element in the path group, and set ID and class
  svgPaths.each(function(e) {
    var domEdge = d3.select(this);
    var edge = g.edge(e);
    edge.elem = this;

    if (edge.id) {
      domEdge.attr("id", edge.id);
    }

    util.applyClass(domEdge, edge["class"],
      (domEdge.classed("update") ? "update " : "") + "edgePath");
  });

  svgPaths.selectAll("path.path")
    .each(function(e) {
      var edge = g.edge(e);
      edge.arrowheadId = _.uniqueId("arrowhead");

      var domEdge = d3.select(this)
        .attr("marker-end", function() {
            return "url(" + makeFragmentRef(location.href, edge.arrowheadId) + ")";
        })
        .style("fill", "none");

      util.applyTransition(domEdge, g)
        .attr("d", function(e) { return calcPoints(g, e); });

      util.applyStyle(domEdge, edge.style);
    });

  svgPaths.selectAll("defs *").remove();
  svgPaths.selectAll("defs")
    .each(function(e) {
      var edge = g.edge(e),
          arrowhead = arrows[edge.arrowhead];
      arrowhead(d3.select(this), edge.arrowheadId, edge, "arrowhead");
    });

  return svgPaths;
}

function adjustEdgeForCategories(g) {
  g.edges().forEach(function (e) {
    var edge = g.edge(e),
        source = g.node(e.v);
    // Only perform this adjustment if the edge & source node has the required
    // properties.
    if (!edge.hasOwnProperty("categoryIndex")
        || !source.hasOwnProperty("numCategories")
        || source.numCategories === 0) {
      return;
    }

    var edgesInCategory = g.outEdges(e.v).filter(inSameCategory(g, e));
    var categoryIndex = edgesInCategory.indexOf(e);
    var pctPlacement = (categoryIndex + 1)/(edgesInCategory.length + 1);
    var categoryWidth = (source.width - 30)/source.numCategories;
    var nodeStartXPos = source.x - source.width/2;

    // Assign a new x value for the first point so it is in the correct category.
    edge.points[0].x = nodeStartXPos + categoryWidth * edge.categoryIndex
        + pctPlacement * categoryWidth;
    edge.points[0].y = source.y + source.height/2;

    if (e.v !== e.w && g.graph().hasOwnProperty("ranksep")) {
        // Make sure the second point in the edge is at least ranksep from the
        // node.
        edge.points[1].y = Math.max(edge.points[1].y, edge.points[0].y
            + g.graph().ranksep - 20);
    } else {
        // Recursive edge.
        var p1 = edge.points[0];
        var x2 = p1.x, y2 = p1.y + 50;
        var x3;
        if (p1.x < source.x) {
            // Wrap around left of node
            x3 = source.x - source.width/2 - 50;
        } else {
            // Wrap around right of node
            x3 = source.x + source.width/2 + 50;
        }
        var y3 = y2;
        var x4 = x3, y4 = source.y;
        var x5;
        if (p1.x < source.x) {
            // Wrap around left of node
            x5 = x4 + 50;
        } else {
            // Wrap around right of node
            x5 = x4 - 50;
        }
        var y5 = y4;
        edge.points = [edge.points[0], {x: x2, y: y2}, {x: x3, y: y3},
            {x: x4, y: y4}, {x: x5, y: y5}];
    }
  });
}

function inSameCategory(g, e1) {
  return function(e2) {
    return g.edge(e1).categoryIndex === g.edge(e2).categoryIndex;
  };
}

function makeFragmentRef(url, fragmentId) {
  var baseUrl = url.split("#")[0];
  return baseUrl + "#" + fragmentId;
}

function calcPoints(g, e) {
  var edge = g.edge(e),
      tail = g.node(e.v),
      head = g.node(e.w);
  var points;
  if (edge.hasOwnProperty("categoryIndex")
      && tail.hasOwnProperty("numCategories")) {
    points = edge.points.slice(0, edge.points.length - 1);
  } else {
    points = edge.points.slice(1, edge.points.length - 1);
    points.unshift(intersectNode(tail, points[0]));
  }
  points.push(intersectNode(head, points[points.length - 1]));

  return createLine(edge, points);
}

function createLine(edge, points) {
  var line = d3.svg.line()
    .x(function(d) { return d.x; })
    .y(function(d) { return d.y; });

  if (_.has(edge, "lineInterpolate")) {
    line.interpolate(edge.lineInterpolate);
  }

  if (_.has(edge, "lineTension")) {
    line.tension(Number(edge.lineTension));
  }

  return line(points);
}

function getCoords(elem) {
  var bbox = elem.getBBox(),
      matrix = elem.ownerSVGElement.getScreenCTM()
        .inverse()
        .multiply(elem.getScreenCTM())
        .translate(bbox.width / 2, bbox.height / 2);
  return { x: matrix.e, y: matrix.f };
}

function enter(svgPaths, g) {
  var svgPathsEnter = svgPaths.enter()
    .append("g")
      .attr("class", "edgePath")
      .style("opacity", 0);
  svgPathsEnter.append("path")
    .attr("class", "path")
    .attr("d", function(e) {
      var edge = g.edge(e),
          sourceElem = g.node(e.v).elem,
          points = _.range(edge.points.length).map(function() { return getCoords(sourceElem); });
      return createLine(edge, points);
    });
  svgPathsEnter.append("defs");
}

function exit(svgPaths, g) {
  var svgPathExit = svgPaths.exit();
  util.applyTransition(svgPathExit, g)
    .style("opacity", 0)
    .remove();

  util.applyTransition(svgPathExit.select("path.path"), g)
    .attr("d", function(e) {
      var source = g.node(e.v);

      if (source) {
        var points = _.range(this.getTotalLength()).map(function() { return source; });
        return createLine({}, points);
      } else {
        return d3.select(this).attr("d");
      }
    });
}
