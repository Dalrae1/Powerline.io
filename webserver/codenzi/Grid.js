function drawGrid(context)
{
	// Grid that works with camera scale

	// Get Center of world position
	var worldScreenCenter = {
		x: (canvas.width/2 + (camera.x * camera.zoom - canvas.width / 2)) / camera.zoom,
		y: (canvas.height/2 + (camera.y * camera.zoom  - canvas.height / 2)) / camera.zoom
	}

	var zoom = camera.zoom;

	var w = canvas.width / zoom, h = canvas.height / zoom;
	var gridSpacing = 50/(10.0/GAME_SCALE);

	context.strokeStyle='hsl(231,15%,0%)';
	context.lineWidth=1;
	context.globalAlpha = 0.1;

	var gridX = worldScreenCenter.x%gridSpacing;
	var beginX = worldScreenCenter.x - gridX;
	var endX = beginX + gridX + canvas.width/2.0/zoom;
	var beginY = worldScreenCenter.y - h/2;
	var endY = beginY + h;
	var count = 1;
	for(var x = beginX; x < endX; x += gridSpacing){
		context.beginPath();
		context.moveTo(x, beginY);
		context.lineTo(x, endY);
		context.stroke();

		context.beginPath();
		context.moveTo(beginX - gridSpacing*count, beginY);
		context.lineTo(beginX - gridSpacing*count, endY);
		context.stroke();

		count++;
	}
	context.beginPath();
	context.moveTo(beginX - gridSpacing*count, beginY);
	context.lineTo(beginX - gridSpacing*count, endY);
	context.stroke();

	count = 1;
	beginX = worldScreenCenter.x - w/2;
	endX = beginX + w;
	var gridY = worldScreenCenter.y%gridSpacing;
	beginY = worldScreenCenter.y - gridY;
	endY = beginY + gridY + canvas.height/2.0/zoom;
	for(var y = beginY; y < endY; y += gridSpacing){
		context.beginPath();
		context.moveTo(beginX, y);
		context.lineTo(endX, y);
		context.stroke();

		context.beginPath();
		context.moveTo(beginX, beginY - gridSpacing*count);
		context.lineTo(endX, beginY - gridSpacing*count);
		context.stroke();

		count++;
	}
	context.beginPath();
	context.moveTo(beginX, beginY - gridSpacing*count);
	context.lineTo(endX, beginY - gridSpacing*count);
	context.stroke();

	context.globalAlpha = 1.0;
}
