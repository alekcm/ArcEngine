Author = "AxeNato"

if( CLIENT ) then



	function ThirdPersonUmsg( data )

		if( LocalPlayer().ThirdPerson == nil ) then

			LocalPlayer().ThirdPerson = true;

		else

			LocalPlayer().ThirdPerson = !LocalPlayer().ThirdPerson;

		end;	

	end;

	usermessage.Hook( "ThirdPerson", ThirdPersonUmsg );

	

	function ThirdPersonF( ply, pos, ang, fov )

		if( LocalPlayer().ThirdPerson ) then

			local view = {};

			local dist = 50;

			local trace = {};

			

			trace.start = pos;

			trace.endpos = pos - ( ang:Forward() * dist );

			trace.filter = LocalPlayer();

			local trace = util.TraceLine( trace );

			if( trace.HitPos:Distance( pos ) < dist - 10 ) then

				dist = trace.HitPos:Distance( pos ) - 10;

			end;

			view.origin = pos - ( ang:Forward() * dist ) - Vector(0,-20,0);

			view.angles = ang;

			view.fov = fov;

			

			return view;

		end;

	end;

	hook.Add( "CalcView", "ThirdPerson", ThirdPersonF );

	

	function ThirdPersonSDLP()

		if( LocalPlayer().ThirdPerson ) then

			return true;

		end;

	end;

	hook.Add( "ShouldDrawLocalPlayer", "ThirdPersonSDLP", ThirdPersonSDLP );



else



	function ToggleThirdPerson( ply, button )
		if button == 30 then

			umsg.Start( "ThirdPerson", ply );

			umsg.End();
		end
	end;

	hook.Add("PlayerButtonDown", "ToggleThirdPerson", ToggleThirdPerson );
	

end;