--Loopers--
volhackSupers =0
local loopersWindow = nil
hook.Add("PlayerButtonDown", "MasterMindYuki", function (ply, button)
    if button == 9 and loopersWindow == nil then
    	if ply:IsSuperAdmin() then
			loopersWindow = vgui.Create( "DFrame" )
            loopersWindow:SetSize( ScrW()/1.2, ScrH()/1.2 )
            loopersWindow:Center()
            loopersWindow:MakePopup()

            function loopersWindow:OnRemove()
                loopersWindow = nil 
            end

            buttonZap = loopersWindow:Add("DButton")
            buttonZap:SetText("Запомнить")
            buttonZap:SetPos(50,50)
            buttonZap.DoClick = function()
            	net.Start("LoopersPositionZap")
            	net.SendToServer()
            end

            buttonVsp = loopersWindow:Add("DButton")
            buttonVsp:SetText("Вспомнить")
            buttonVsp:SetPos(buttonZap:GetX() + buttonZap:GetWide() ,50)
            buttonVsp.DoClick = function()
            	net.Start("LoopersPosition")
            	net.SendToServer()
            end

            buttonFoto = loopersWindow:Add("DButton")
            buttonFoto:SetText("Фото")
            buttonFoto:SetPos(buttonVsp:GetX() + buttonZap:GetWide() ,50)
            buttonFoto.DoClick = function()
            	net.Start("Foto")
            	net.SendToServer()
            end

            buttonDark = loopersWindow:Add("DButton")
            buttonDark:SetText("Тьма")
            buttonDark:SetPos(buttonFoto:GetX() + buttonFoto:GetWide() ,50)
            buttonDark.DoClick = function()
            	net.Start("DarkUsers")
            	net.SendToServer()
            end

            buttonSV = loopersWindow:Add("DButton")
            buttonSV:SetText("Волхаксуперов")
            buttonSV:SetPos(buttonDark:GetX() + buttonDark:GetWide() ,50)
            buttonSV.DoClick = function()
            	if volhackSupers == 0 then
            		volhackSupers = 1
            	else
            		volhackSupers = 0
            	end
            end
    	end
    end

    net.Receive("FotoClient", function (len,ply)
    									LocalPlayer():ScreenFade( SCREENFADE.PURGE, Color( 0,0,0, 0 ),1,0)
						LocalPlayer():ScreenFade( SCREENFADE.IN, Color( 0,0,0, 255 ), 0.5, 0 )
		LocalPlayer():ScreenFade( SCREENFADE.IN, Color( 255,255,255, 255 ), 0.2, 0 )
		surface.PlaySound( "items/nvg_on.wav" )
    end)
end)


print("presents save")