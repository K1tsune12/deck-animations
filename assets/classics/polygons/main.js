// Polygon Trails: two bouncing quadrilaterals leaving fading, colour-cycling
// echoes (in the spirit of the classic "Mystify").

const VERTICES = 4;
const ECHOES = 14;
const ECHO_SPACING = 0.035; // seconds between echoes
const SPEED = 220; // px/s

const view = CreateCanvas();

function NewShape( hue )
{
    const points = [];
    for ( let i = 0; i < VERTICES; i++ )
    {
        const angle = Rand( 0, Math.PI * 2 );
        points.push( {
            x: Rand( 0, view.width ), y: Rand( 0, view.height ),
            vx: Math.cos( angle ) * Rand( 0.6, 1 ) * SPEED, vy: Math.sin( angle ) * Rand( 0.6, 1 ) * SPEED,
        } );
    }
    return { points, hue, history: [], sinceEcho: 0 };
}

const shapes = [ NewShape( Rand( 0, 360 ) ), NewShape( Rand( 0, 360 ) ) ];

function Move( shape, dt )
{
    for ( const p of shape.points )
    {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if ( p.x < 0 || p.x > view.width ) { p.vx *= -1; p.x = Math.max( 0, Math.min( view.width, p.x ) ); }
        if ( p.y < 0 || p.y > view.height ) { p.vy *= -1; p.y = Math.max( 0, Math.min( view.height, p.y ) ); }
    }
    shape.hue = ( shape.hue + dt * 25 ) % 360;
    shape.sinceEcho += dt;
    if ( shape.sinceEcho >= ECHO_SPACING )
    {
        shape.sinceEcho = 0;
        shape.history.unshift( shape.points.map( p => [ p.x, p.y ] ) );
        shape.history.length = Math.min( shape.history.length, ECHOES );
    }
}

function Draw( shape )
{
    const { ctx } = view;
    shape.history.forEach( ( pts, i ) =>
    {
        const fade = 1 - i / ECHOES;
        ctx.strokeStyle = `hsla(${ shape.hue }, 100%, 60%, ${ fade })`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        pts.forEach( ( [ x, y ], j ) => j ? ctx.lineTo( x, y ) : ctx.moveTo( x, y ) );
        ctx.closePath();
        ctx.stroke();
    } );
}

RunLoop( dt =>
{
    view.ctx.fillStyle = 'black';
    view.ctx.fillRect( 0, 0, view.width, view.height );
    for ( const shape of shapes )
    {
        Move( shape, dt );
        Draw( shape );
    }
} );
