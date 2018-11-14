import ActorSkinnableNode from "./ActorSkinnableNode.js";
import {vec2, mat2d} from "gl-matrix";
import {PathPoint, PointType} from "./PathPoint.js";
import PathMatrix from "./PathMatrix.js";

const CircleConstant = 0.552284749831;
const InverseCircleConstant = 1.0-CircleConstant;

export default class ActorPath extends ActorSkinnableNode
{
	constructor()
	{
		super();
		this._IsClosed = false;
		this._IsHidden = false;
		this._Points = [];
		this._RenderPath = null;
		this._Skin = null;
	}
	
	setSkin(skin)
	{
		this._Skin = skin;
	}
	
	get isHidden()
	{
		return this._IsHidden;
	}

	set isHidden(hidden)
	{
		this._IsHidden = hidden;
	}

	get isClosed()
	{
		return this._IsClosed;
	}

	set isClosed(closed)
	{
		this._IsClosed = closed;
	}

	initialize(actor, graphics)
	{
		
	}

	get numPoints()
	{
		return this._Points.length;
	}

	getPathOBB()
	{
		let min_x = Number.MAX_VALUE;
		let min_y = Number.MAX_VALUE;
		let max_x = -Number.MAX_VALUE;
		let max_y = -Number.MAX_VALUE;

		const renderPoints = this.makeRenderPoints();
		for(let point of renderPoints)
		{
			let t = point.translation;
			
			let x = t[0];
			let y = t[1];

			if(x < min_x)
			{
				min_x = x;
			}
			if(y < min_y)
			{
				min_y = y;
			}
			if(x > max_x)
			{
				max_x = x;
			}
			if(y > max_y)
			{
				max_y = y;
			}

			if(point.pointType !== PointType.Straight)
			{
				let t = point.in;
				x = t[0];
				y = t[1];
				if(x < min_x)
				{
					min_x = x;
				}
				if(y < min_y)
				{
					min_y = y;
				}
				if(x > max_x)
				{
					max_x = x;
				}
				if(y > max_y)
				{
					max_y = y;
				}

				t = point.out;
				x = t[0];
				y = t[1];
				if(x < min_x)
				{
					min_x = x;
				}
				if(y < min_y)
				{
					min_y = y;
				}
				if(x > max_x)
				{
					max_x = x;
				}
				if(y > max_y)
				{
					max_y = y;
				}
			}
		}

		return [min_x, min_y, max_x, max_y];
	}

	getPathAABB()
	{
		let min_x = Number.MAX_VALUE;
		let min_y = Number.MAX_VALUE;
		let max_x = -Number.MAX_VALUE;
		let max_y = -Number.MAX_VALUE;

		const obb = this.getPathOBB();

		const points = [
			vec2.fromValues(obb[0], obb[1]),
			vec2.fromValues(obb[2], obb[1]),
			vec2.fromValues(obb[2], obb[3]),
			vec2.fromValues(obb[0], obb[3])
		];
		let {_Transform:transform, isConnectedToBones} = this;

		if(isConnectedToBones)
		{
			// If we're connected to bones, convert the path coordinates into local parent space.
			transform = mat2d.invert(mat2d.create(), this.parent._WorldTransform);
		}

		for(let i = 0; i < points.length; i++)
		{
			const pt = points[i];
			const wp = transform ? vec2.transformMat2d(pt, pt, transform) : pt;
			if(wp[0] < min_x)
			{
				min_x = wp[0];
			}
			if(wp[1] < min_y)
			{
				min_y = wp[1];
			}

			if(wp[0] > max_x)
			{
				max_x = wp[0];
			}
			if(wp[1] > max_y)
			{
				max_y = wp[1];
			}
		}

		return [min_x, min_y, max_x, max_y];
	}

	makeInstance(resetActor)
	{
		const node = new ActorPath();
		node.copy(this, resetActor);
		return node;	
	}

	copy(node, resetActor)
	{
		super.copy(node, resetActor);

		this._IsClosed = node._IsClosed;
		this._IsHidden = node._IsHidden;

		const pointCount = node._Points.length;
		this._Points = new Array(pointCount);
		for(let i = 0; i < pointCount; i++)
		{
			let p = node._Points[i];
			this._Points[i] = p.makeInstance();
		}
	}

	get deformedPoints()
	{
		let boneTransforms = null;
		if(this._Skin)
		{
			boneTransforms = this._Skin.boneMatrices;
		}
		const {_Points:points, worldTransform} = this;
		if(!boneTransforms)
		{
			return points;
		}

		const deformedPoints = [];
		for(const point of points)
		{
			deformedPoints.push(point.skin(worldTransform, boneTransforms));
		}
		return deformedPoints;
	}

	makeRenderPoints()
	{
		let points = this.deformedPoints;

		let renderPoints = [];
		
		if(points.length)
		{
			let pl = points.length;
			const isClosed = this.isClosed;
			let previous = isClosed ? points[points.length-1] : null;
			for(let i = 0; i < points.length; i++)
			{
				let point = points[i];

				switch(point.pointType)
				{
					case PointType.Straight:
					{
						const radius = point.radius;
						if(radius > 0)
						{
							if(!isClosed && (i === 0 || i === pl-1))
							{
								renderPoints.push(point);
								previous = point;
							}
							else
							{
								let next = points[(i+1)%pl];
								previous = previous.pointType === PointType.Straight ? previous.translation : previous.out;
								next = next.pointType === PointType.Straight ? next.translation : next.in;

								const pos = point.translation;

								const toPrev = vec2.subtract(vec2.create(), previous, pos);
								const toPrevLength = vec2.length(toPrev);
								toPrev[0] /= toPrevLength;
								toPrev[1] /= toPrevLength;

								const toNext = vec2.subtract(vec2.create(), next, pos);
								const toNextLength = vec2.length(toNext);
								toNext[0] /= toNextLength;
								toNext[1] /= toNextLength;

								const renderRadius = Math.min(toPrevLength, Math.min(toNextLength, radius));

								let translation = vec2.scaleAndAdd(vec2.create(), pos, toPrev, renderRadius);
								const current = {
									pointType:PointType.Disconnected,
									translation:translation,
									out:vec2.scaleAndAdd(vec2.create(), pos, toPrev, InverseCircleConstant*renderRadius),
									in:translation
								};
								renderPoints.push(current);

								translation = vec2.scaleAndAdd(vec2.create(), pos, toNext, renderRadius);

								previous = {
									pointType:PointType.Disconnected,
									translation:translation,
									in:vec2.scaleAndAdd(vec2.create(), pos, toNext, InverseCircleConstant*renderRadius),
									out:translation
								};
								renderPoints.push(previous);
							}
						}
						else
						{
							renderPoints.push(point);
							previous = point;
						}
						break;
					}
					case PointType.Mirror:
					case PointType.Disconnected:
					case PointType.Asymmetric:
						renderPoints.push(point);
						previous = point;
						break;
				}
			}
		}
		return renderPoints;
	}

	getPathRenderTransform()
	{
		if(!this.isConnectedToBones)
		{
			return this.worldTransform;
		}
		else
		{
			return undefined;
		}
	}

	getPathTransform()
	{
		if(!this.isConnectedToBones)
		{
			return PathMatrix(this.worldTransform);
		}
		else
		{
			return undefined;
		}
	}

	invalidatePath()
	{
		this._RenderPath = null;
	}

	getPath()
	{
		const renderPath = this._RenderPath;
		if(renderPath)
		{
			return renderPath;
		}

		const path = new Path2D();
		
		const renderPoints = this.makeRenderPoints();
		const isClosed = this.isClosed;

		if(renderPoints.length)
		{
			let firstPoint = renderPoints[0];
			path.moveTo(firstPoint.translation[0], firstPoint.translation[1]);
			for(let i = 0, l = isClosed ? renderPoints.length : renderPoints.length-1, pl = renderPoints.length; i < l; i++)
			{
				let point = renderPoints[i];
				let nextPoint = renderPoints[(i+1)%pl];
				let cin = nextPoint.pointType === PointType.Straight ? null : nextPoint.in, cout = point.pointType === PointType.Straight ? null : point.out;
				if(cin === null && cout === null)
				{
					path.lineTo(nextPoint.translation[0], nextPoint.translation[1]);	
				}
				else
				{
					if(cout === null)
					{
						cout = point.translation;
					}
					if(cin === null)
					{
						cin = nextPoint.translation;
					}
					path.bezierCurveTo(
						cout[0], cout[1],

						cin[0], cin[1],

						nextPoint.translation[0], nextPoint.translation[1]);
				}
			}
			if(isClosed)
			{
				path.closePath();
			}
		}


		this._RenderPath = path;
		return path;
	}
}