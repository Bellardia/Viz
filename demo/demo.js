var iv, i = 1, duration = 10000;
$(document).ready(function () {
    $('#logo-shadow').plaxify({"xRange":6,"yRange":1, "invert": true})
    $('#logo').plaxify({"xRange":8,"yRange":2, "invert": true})
    $('#loading').plaxify({"xRange":8,"yRange":2, "invert": true})
    $('#logo-sphere-back').plaxify({"xRange":30,"yRange":30})
    $('#logo-sphere-mid').plaxify({"xRange":10,"yRange":10})
    $('#logo-sphere-front').plaxify({"xRange":15,"yRange":12,"invert":true})
    $.plax.enable()
});

$(document).keyup(function(e) {
    if (e.keyCode == 27 && !$('html.loading').length)
        $('#st-container').toggleClass('st-menu-open');
});

$(document).ready(function() {
    var source = 'hits'
    $('.opts-monthly').click(function() {
        if (source != 'hits') {
            source = 'hits';
            globe.workerLoader('data/monthly_hits1.bin', function() {
                clearInterval(iv); iv = undefined;
                $('header nav').html('<ul><li><span>May</span></li><li><span>Jun</span></li><li><span>Jul</span></li><li><span>Aug</span></li><li><span>Sep</span></li><li><span>Oct</span></li><li><span>Nov</span></li><li><span>Dec</span></li><li><span>Jan</span></li><li><span>Feb</span></li><li><span>Mar</span></li><li><span>Apr</span></li></ul>');
                $('header nav li').css('width', '8.33%');
                $('#underline').stop().css('width', $('.navbar ul > li:eq(0) > span').outerWidth() / 2 + 'px');
                globe.points.animate(1, duration/2, function() {
                    ++i;
                    $('.opts-time').click();
                });
            });
        }
    });
    $('.opts-weekly').click(function() {
        if (source != 'sales') {
            source = 'sales';
            globe.workerLoader('data/hourly_hits1.bin', function() {
                clearInterval(iv); iv = undefined;
                $('header nav').html('<ul><li><span>01</span></li><li><span>02</span></li><li><span>03</span></li><li><span>04</span></li><li><span>05</span></li><li><span>06</span></li><li><span>07</span></li><li><span>08</span></li><li><span>09</span></li><li><span>10</span></li><li><span>11</span></li><li><span>12</span></li><li><span>13</span></li><li><span>14</span></li><li><span>15</span></li><li><span>16</span></li><li><span>17</span></li><li><span>18</span></li><li><span>19</span></li><li><span>20</span></li><li><span>21</span></li><li><span>22</span></li><li><span>23</span></li><li><span>24</span></li></ul>');
                $('#underline').stop().css('width', $('.navbar ul > li:eq(0) > span').outerWidth() / 2 + 'px');
                $('header nav li').css('width', '4.16%');
                globe.points.animate(1, duration/2, function() {
                    ++i;
                    $('.opts-time').click();
                });
            });
        }
    });
    $('.opts-blue').click(function() {
        if (globe)
            globe.color = {scale: chroma.interpolate.bezier(['#f7f7ff', '#35d7ee', '#178aeb', '#0a54a8', '#053163'])}
    });
    $('.opts-red').click(function() {
        if (globe)
            globe.color = {scale: chroma.interpolate.bezier(['#fee0d2', '#fc9272', '#de2d26', '#a50e14'])}
    });
    $('.opts-rotate').click(function() {
        if (globe)
            globe.opts.rotate = !globe.opts.rotate;
    });
    
    var animate = function() {
        var span = $('.navbar ul > li:eq(0)').outerWidth();
        if (i == 0)
            $('#underline').css({left: span/2});
        var coord  =  (i + 1) * span - span/2 + 25;
        $('#underline').stop().animate({left: coord}, duration, "linear");
        globe.points.animate(i, duration);
        i = ++i % globe.points.morphTargetInfluences.length;
    }
    
    $('.opts-time').click(function() {
        if (iv) {
            clearInterval(iv)
            iv = undefined;
       } else {
            animate();
            iv = setInterval(animate, duration);
        }
    });;
    
});

$(window).resize(function() {
    $('#container,.overlay').height($(window).height() - $('header').height() + 'px');
    $('.overlay').height($(window).height() - $('header').height() + 'px');
    $('#body').height($(window).height() + 'px');
    
    if (typeof globe != 'undefined')
        globe.renderFrames(1);
});
$(window).resize();

$('#main-menu-min').click(function() {
    $('#st-container').removeClass('st-menu-open');
});

globe  = DAT.Globe().init();
globe.workerLoader('data/monthly_hits1.bin', function() {  
    $('#loading-overlay').fadeOut(500).promise().done(function(points) {
        $('html').removeClass('loading');
        
        $.plax.disable();
        globe.animate();
        globe.points.animate(1, duration/2, function() {
            $('.opts-time').click();
        });
    });  
});

var $el = ('#underline'), width = $('.navbar ul > li:eq(0) > span').outerWidth() / 2;
    
$('#underline').css({
    top: $('.navbar ul > li:eq(0) > span').outerHeight() - 6, 
    width: width*2, 
    left: $('.navbar ul > li:eq(0) > span').offset().left 
});

var move = null;
$('.navbar').mousemove(function(event) {
    clearInterval(iv); iv = undefined;
    clearTimeout(move);
    move = setTimeout(function() {
        var width   = $('.navbar ul > li:eq(0) > span').outerWidth() / 2;
        var len     = globe.points.morphTargetInfluences.length;
        var dist    = Math.abs(parseInt($('#underline').css('left')) - (event.clientX - width));
        var ul      = $('header nav ul').innerWidth() - ( parseInt($('header nav ul').css('padding-left')) * 2)
        var left    = $('header nav ul').offset().left + parseInt($('header nav ul').css('padding-left'));
        var span    = $('.navbar ul > li:eq(0)').outerWidth();
        var pos     = (event.clientX - span/2) - left;
        var index   = Math.max(0, Math.min(pos / span, len-1.01));
        var coord   = Math.max(left + span/2 - width,  Math.min(( index + 1 ) * span - span/2 - 5, left + ul - span/2));
        i = Math.floor(index);
        if (dist > 1) {
            $('#underline').stop().animate({left: coord}, Math.pow(dist,1), "linear");
            globe.points.animate(index, Math.max(dist*2, 0));
        }
    }, Math.ceil(1000 / globe.opts.fps));
});