// Curves: Bézier curves whose control points drift and bounce, drawn with
// glowing, colour-shifting trails.

const CURVES = 3;
const ECHOES = 18;
const ECHO_SPACING = 0.03;
const SPEED = 180;

const view = CreateCanvas();

function NewCurve( hue )
{
    const points = Array.from( { length: 4 }, () =>
    {
        const angle = Rand( 0, Math.PI * 2 );
        return {
            x: Rand( 0, view.width ), y: Rand( 0, view.height ),
            vx: Math.cos( angle ) * Rand( 0.5, 1 ) * SPEED, vy: Math.sin( angle ) * Rand( 0.5, 1 ) * SPEED,
        };
    } );
    return { points, hue, history: [], since: 0 };
}

const curves = Array.from( { length: CURVES }, ( _, i ) => NewCurve( i * 120 ) );

RunLoop( dt =>
{
    const { ctx } = view;
    ctx.fillStyle = 'black';
    ctx.fillRect( 0, 0, view.width, view.height );
    ctx.globalCompositeOperation = 'lighter';

    for ( const c of curves )
    {
        for ( const p of c.points )
        {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if ( p.x < 0 || p.x > view.width ) p.vx *= -1;
            if ( p.y < 0 || p.y > view.height ) p.vy *= -1;
        }
        c.hue = ( c.hue + dt * 20 ) % 360;
        c.since += dt;
        if ( c.since >= ECHO_SPACING )
        {
            c.since = 0;
            c.history.unshift( c.points.map( p => [ p.x, p.y ] ) );
            c.history.length = Math.min( c.history.length, ECHOES );
        }

        c.history.forEach( ( [ a, b, d, e ], i ) =>
        {
            const fade = 1 - i / ECHOES;
            ctx.strokeStyle = `hsla(${ ( c.hue + i * 4 ) % 360 }, 100%, 55%, ${ fade * 0.8 })`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo( a[ 0 ], a[ 1 ] );
            ctx.bezierCurveTo( b[ 0 ], b[ 1 ], d[ 0 ], d[ 1 ], e[ 0 ], e[ 1 ] );
            ctx.stroke();
        } );
    }
    ctx.globalCompositeOperation = 'source-over';
} );
