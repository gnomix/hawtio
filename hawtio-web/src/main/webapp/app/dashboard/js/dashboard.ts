module Dashboard {

  export function DashboardController($scope, $location, $routeParams, $injector, $route,
                                      $templateCache,
                                      workspace:Workspace,
                                      dashboardRepository: DashboardRepository,
                                      $compile) {
    $scope.route = $route;
    $scope.injector = $injector;

    $scope.gridX = 150;
    $scope.gridY = 150;

    $scope.widgetMap = {};

    updateWidgets();


    $scope.removeWidget = function(widget) {
      var gridster = getGridster();
      var widgetElem = null;

      // lets destroy the widgets's scope
      var widgetData = $scope.widgetMap[widget.id];
      if (widgetData) {
        delete $scope.widgetMap[widget.id];
        var scope = widgetData.scope;
        widgetElem = widgetData.widget;
        if (scope) {
          scope.$destroy();
        }
      }
      if (!widgetElem) {
        // lets get the li parent element of the template
        widgetElem = $("div").find("[data-widgetId='" + widget.id + "']").parent();
      }
      if (gridster && widgetElem) {
        gridster.remove_widget(widgetElem);
      }
      // no need to remove it...
      //widgetElem.remove();

      // lets trash the JSON metadata
      if ($scope.dashboard) {
        var widgets = $scope.dashboard.widgets;
        if (widgets) {
          widgets.remove(widget);
        }
      }

      updateDashboardRepository("Removed widget " + widget.title);
    };

    function changeWidgetSize(widget, sizefunc, savefunc) {
      var gridster = getGridster();
      var entry = $scope.widgetMap[widget.id];
      var w = entry.widget;
      var scope = entry.scope;
      sizefunc();
      gridster.resize_widget(w, widget.size_x, widget.size_y);

      setTimeout(function() {
        var template = $templateCache.get("widgetTemplate");
        var div = $('<div></div>');
        div.html(template);
        w.html($compile(div.contents())(scope));

        $scope.$apply();

        setTimeout(function() {
          savefunc();
        }, 50);
      }, 50);
    }

    $scope.growWidgetX = function(widget) {
      changeWidgetSize(widget, function() {
        widget.size_x = widget.size_x + 1;
      }, function() {
        updateDashboardRepository("Increased width of widget " + widget.title);
      });
    };

    $scope.growWidgetY = function(widget) {
      changeWidgetSize(widget, function() {
        widget.size_y = widget.size_y + 1;
      }, function() {
        updateDashboardRepository("Increased height of widget " + widget.title);
      });
    };

    $scope.shrinkWidgetX = function(widget) {
      changeWidgetSize(widget, function() {
        widget.size_x = widget.size_x - 1;
      }, function() {
        updateDashboardRepository("Decreased width of widget " + widget.title);
      });
    };

    $scope.shrinkWidgetY = function(widget) {
      changeWidgetSize(widget, function() {
        widget.size_y = widget.size_y - 1;
      }, function() {
        updateDashboardRepository("Decreased height of widget " + widget.title);
      });
    }

/*
    $scope.$on("$routeChangeSuccess", function (event, current, previous) {
      console.log("dashboard changed with $routeParams " + JSON.stringify($routeParams));
      // lets do this asynchronously to avoid Error: $digest already in progress
      setTimeout(updateWidgets, 50);
    });
*/

    $scope.onWidgetRenamed = function(widget) {
      updateDashboardRepository("Renamed widget to " + widget.title);
    };

    function updateWidgets() {
      $scope.id = $routeParams["dashboardId"];
      $scope.idx = $routeParams["dashboardIndex"];
      if ($scope.id) {
        dashboardRepository.getDashboard($scope.id, onDashboardLoad);
      } else {
        dashboardRepository.getDashboards((dashboards) => {
          var idx = $scope.idx ? parseInt($scope.idx) : 0;
          var id = null;
          if (dashboards.length > 0) {
            var dashboard = dashboards.length > idx ? dashboards[idx] : dashboard[0];
            id = dashboard.id;
          }
          if (id) {
            $location.path("/dashboard/id/" + id);
          } else {
            $location.path("/dashboard/edit?tab=dashboard");
          }
          //$scope.$apply();
        });
      }
    }

    function onDashboardLoad(dashboard) {
      $scope.dashboard = dashboard;
      var widgetElement = $("#widgets");

      var gridster = widgetElement.gridster({
        widget_margins: [6, 6],
        widget_base_dimensions: [$scope.gridX, $scope.gridY],
        extra_rows: 10,
        extra_cols: 6,
        draggable: {
          stop: (event, ui) => {
            updateLayoutConfiguration();
          }
        }
      }).data('gridster');


      var template = $templateCache.get("widgetTemplate");
      var widgets = ((dashboard) ? dashboard.widgets : null) || [];
      angular.forEach(widgets, (widget) => {
        var childScope = $scope.$new(false);
        childScope.widget = widget;
        var path = widget.path;
        var search = Dashboard.decodeURIComponentProperties(widget.search);
        var hash = widget.hash; // TODO decode object?
        var location = new RectangleLocation($location, path, search, hash);

        var childWorkspace = workspace.createChildWorkspace(location);
        //var childWorkspace = workspace;
        childWorkspace.$location = location;

        // now we need to update the selection from the location search()
        var key = location.search()['nid'];
        if (key && workspace.tree) {
          // lets find the node for this key...
          childWorkspace.selection = workspace.keyToNodeMap[key];
          if (!childWorkspace.selection) {
            var decodedKey = decodeURIComponent(key);
            childWorkspace.selection = workspace.keyToNodeMap[decodedKey];
          }
        }

        var $$scopeInjections = {
          workspace: childWorkspace,
          location: location,
          $location: location,
          $routeParams: {x: "123", y: "Cheese!"}
        };
        childScope.$$scopeInjections = $$scopeInjections;

        if (!widget.size_x || widget.size_x < 1) {
          widget.size_x = 1;
        }
        if (!widget.size_y || widget.size_y < 1) {
          widget.size_y = 1;
        }
        var div = $('<div></div>');
        div.html(template);

        var outerDiv = $('<li style="display: list-item; position: absolute"></li>');
        outerDiv.html($compile(div.contents())(childScope));
        var w = gridster.add_widget(outerDiv, widget.size_x, widget.size_y, widget.col, widget.row);

        $scope.widgetMap[widget.id] = {
          widget: w,
          scope: childScope
        };

        /*
        childScope.$watch(function(scope) {
          var area = w.find('.widget-area')[0];

          var desired_width = Math.ceil(area.scrollWidth / $scope.gridX);
          var desired_height = Math.ceil(area.scrollHeight / $scope.gridY);
          var actual_width = parseInt(w.attr('data-sizex'));
          var actual_height = parseInt(w.attr('data-sizey'));

          if (actual_width !== desired_width || actual_height !== desired_height) {

            // TODO - should save this back into the dashboard registry...
            // console.log("Actual size: " + actual_width + " x " + actual_height);
            // console.log("desired size: " + desired_width + " x " + desired_height);
            gridster.resize_widget(w, desired_width, desired_height);
            gridster.set_dom_grid_height();
          }
        });
        */

      });


      if (!$scope.$$phase) {
        $scope.$apply();
      }

      function updateLayoutConfiguration() {
        var gridster = getGridster();
        if (gridster) {
          var data = gridster.serialize();
          console.log("got data: " + JSON.stringify(data));

          var widgets = $scope.dashboard.widgets || [];
          // lets assume the data is in the order of the widgets...
          angular.forEach(widgets, (widget, idx) => {
            var value = data[idx];
            if (value && widget) {
              // lets copy the values across
              angular.forEach(value, (attr, key) => widget[key] = attr);
            }
          });

          updateDashboardRepository("Changing dashboard layout");
        }
      }
    }


    function updateDashboardRepository(message: string) {
      if ($scope.dashboard) {
        var commitMessage = message;
        if ($scope.dashboard && $scope.dashboard.title) {
          commitMessage += " on dashboard " + $scope.dashboard.title;
        }
        dashboardRepository.putDashboards([$scope.dashboard], commitMessage, Dashboard.onOperationComplete);
      }
    }

    function getGridster() {
      return $("#widgets").gridster().data('gridster');
    }
  }
}
