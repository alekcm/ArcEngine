local img = nil
local imageent = nil
local maxcount = 0
local count = 0
local _html
local screenHsize = ScrH()/1080.0
print('image has been loaded')
net.Receive("SendImageURL", function ()
	imageent = net.ReadEntity()
        count = 0
        maxcount = net.ReadFloat()
    local DFrame = vgui.Create("DFrame")
        if img ~= nil then
            img:Remove()
            img = nil
            end
        img = DFrame
        DFrame:ShowCloseButton(false)
		DFrame:SetSize( 752.0*screenHsize,1062.0*screenHsize)
		DFrame:Center()
		DFrame:SetTitle("")
        DFrame:MakePopup()
        DFrame:SetKeyboardInputEnabled(false)
		DFrame.Paint = function (self,w,h)
            end
            local html = vgui.Create("DHTML",DFrame)
            html:SetSize(752.0*screenHsize, 1062.0*screenHsize)
            local htmlcode = '<img src="'..imageent:GetNWString("Page"..count)..'" width="'..752.0*screenHsize*0.9 ..'" height="'..1062.0*screenHsize*0.9 ..'" />'
        _html = html
            html:SetHTML(htmlcode)
           
end)
local single = true
    hook.Add("PlayerButtonDown", "ImageURL", function (ply, button)
	--if button == 51 then
            if img ~= nil then
            if button == 90 then
                if single then
                    single = false
                    timer.Simple(0.1, function() single = true end)
            	if count > 0 then
                	count = count - 1
                	_html:SetHTML('<img src="'..imageent:GetNWString("Page"..count)..'" width="'..752.0*screenHsize*0.9 ..'" height="'..1062.0*screenHsize*0.9 ..'"/>')
            	end
            end
                end
            if button == 88 then
                if single then
                    single = false
                    timer.Simple(0.1, function() single = true end)
            	if count < maxcount then
                	count = count + 1
                	_html:SetHTML('<img src="'..imageent:GetNWString("Page"..count)..'" width="'..752.0*screenHsize*0.9 ..'" height="'..1062.0*screenHsize*0.9 ..'"/>')
            	end
            end
                end
            if button == 64 then
            		img:Remove()
            		img = nil
                end
            end
        end)
    
    
    
print('image has been loaded')




