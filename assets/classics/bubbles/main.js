// Bubbles: iridescent soap bubbles drifting and bouncing off each other.

const COUNT = 14;

const view = CreateCanvas();
const bubbles = [];

for ( let i = 0; i < COUNT; i++ )
{
    const r = Rand( 40, 110 );
    const angle = Rand( 0, Math.PI * 2 );
    const speed = Rand( 40, 110 );
    bubbles.push( {
        x: Rand( r, view.width - r ), y: Rand( r, view.height - r ), r,
        vx: Math.cos( angle ) * speed, vy: Math.sin( angle ) * speed,
        spin: Rand( 0, Math.PI * 2 ), spinSpeed: Rand( -0.6, 0.6 ),
    } );
}

function Collide( a, b )
{
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.hypot( dx, dy );
    if ( dist === 0 || dist >= a.r + b.r )
        return;
    const nx = dx / dist, ny = dy / dist;
    // push apart, then exchange the normal velocity components (mass ~ area)
    const overlap = ( a.r + b.r - dist ) / 2;
    a.x -= nx * overlap; a.y -= ny * overlap;
    b.x += nx * overlap; b.y += ny * overlap;
    const ma = a.r * a.r, mb = b.r * b.r;
    const va = a.vx * nx + a.vy * ny, vb = b.vx * nx + b.vy * ny;
    if ( va - vb <= 0 )
        return;
    const na = ( va * ( ma - mb ) + 2 * mb * vb ) / ( ma + mb );
    const nb = ( vb * ( mb - ma ) + 2 * ma * va ) / ( ma + mb );
    a.vx += ( na - va ) * nx; a.vy += ( na - va ) * ny;
    b.vx += ( nb - vb ) * nx; b.vy += ( nb - vb ) * ny;
}

function Draw( b )
{
    const { ctx } = view;
    // thin-film rim: a slowly rotating rainbow around the edge
    const rim = ctx.createConicGradient( b.spin, b.x, b.y );
    [ 0, 60, 120, 180, 240, 300, 360 ].forEach( ( h, i ) => rim.addColorStop( i / 6, `hsla(${ h }, 100%, 70%, 0.55)` ) );
    ctx.strokeStyle = rim;
    ctx.lineWidth = b.r * 0.08;
    ctx.beginPath();
    ctx.arc( b.x, b.y, b.r * 0.96, 0, Math.PI * 2 );
    ctx.stroke();

    const body = ctx.createRadialGradient( b.x, b.y, b.r * 0.6, b.x, b.y, b.r );
    body.addColorStop( 0, 'rgba(255, 255, 255, 0)' );
    body.addColorStop( 1, 'rgba(180, 220, 255, 0.18)' );
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc( b.x, b.y, b.r, 0, Math.PI * 2 );
    ctx.fill();

    const shine = ctx.createRadialGradient( b.x - b.r * 0.4, b.y - b.r * 0.45, 0, b.x - b.r * 0.4, b.y - b.r * 0.45, b.r * 0.35 );
    shine.addColorStop( 0, 'rgba(255, 255, 255, 0.85)' );
    shine.addColorStop( 1, 'rgba(255, 255, 255, 0)' );
    ctx.fillStyle = shine;
    ctx.beginPath();
    ctx.arc( b.x - b.r * 0.4, b.y - b.r * 0.45, b.r * 0.35, 0, Math.PI * 2 );
    ctx.fill();
}

RunLoop( dt =>
{
    const { ctx } = view;
    ctx.fillStyle = 'black';
    ctx.fillRect( 0, 0, view.width, view.height );

    for ( const b of bubbles )
    {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.spin += b.spinSpeed * dt;
        if ( b.x < b.r ) { b.x = b.r; b.vx = Math.abs( b.vx ); }
        if ( b.x > view.width - b.r ) { b.x = view.width - b.r; b.vx = -Math.abs( b.vx ); }
        if ( b.y < b.r ) { b.y = b.r; b.vy = Math.abs( b.vy ); }
        if ( b.y > view.height - b.r ) { b.y = view.height - b.r; b.vy = -Math.abs( b.vy ); }
    }
    for ( let i = 0; i < bubbles.length; i++ )
        for ( let j = i + 1; j < bubbles.length; j++ )
            Collide( bubbles[ i ], bubbles[ j ] );
    bubbles.forEach( Draw );
} );
