
CreateConVar('talkicon_computablecolor', 1, FCVAR_ARCHIVE + FCVAR_REPLICATED + FCVAR_SERVER_CAN_EXECUTE, 'Compute color from location brightness.')
CreateConVar('talkicon_showtextchat', 1, FCVAR_ARCHIVE + FCVAR_REPLICATED + FCVAR_SERVER_CAN_EXECUTE, 'Show icon on using text chat.')
CreateConVar('talkicon_ignoreteamchat', 1, FCVAR_ARCHIVE + FCVAR_REPLICATED + FCVAR_SERVER_CAN_EXECUTE, 'Disable over-head icon on using team chat.')

if (SERVER) then

	RunConsoleCommand('mp_show_voice_icons', '0')

	resource.AddFile('materials/talkicon1/voice2.png')
	resource.AddFile('materials/talkicon1/text.png')

	util.AddNetworkString('TalkIconChat')
	util.AddNetworkString('SetPlayerVolume')
	util.AddNetworkString('SetGlobalPlayerVolume')

	net.Receive('TalkIconChat', function(_, ply)
		local bool = net.ReadBool()
		ply:SetNW2Bool('ti_istyping', (bool ~= nil) and bool or false)
	end)



elseif (CLIENT) then

	local computecolor = GetConVar('talkicon_computablecolor')
	local showtextchat = GetConVar('talkicon_showtextchat')
	local noteamchat = GetConVar('talkicon_ignoreteamchat')

	local voice_mat = Material('talkicon1/voice2.png')
	local text_mat = Material('talkicon1/text.png')
	local pad_mat = Material('talkicon1/ipad_icon8.png')

net.Receive('SetGlobalPlayerVolume', function()
	local ply = net.ReadEntity()
	ply:SetVoiceVolumeScale(1)
end)


--[[net.Receive('SetPlayerVolume', function()
	--local plyName = net.ReadString()
	local ply = net.ReadEntity()
	--[[local ply = LocalPlayer()
	for i, v in ipairs( player.GetAll() ) do
		if v:Name() == plyName then
			ply = v
		end
	end--]]
	--print(ply:GetNWFloat("VoiceDistance"))
	--[[if (ply:GetNWFloat("VoiceDistance") > 5000) then
		ply:SetVoiceVolumeScale(1)
	else
	local range = LocalPlayer():GetPos():Distance(ply:GetPos())-(ply:GetNWFloat("VoiceDistance"))
	if range <= 0 then
		ply:SetVoiceVolumeScale(1)
	else 
		local scaler = (ply:GetNWFloat("VoiceDistance")-range)/(ply:GetNWFloat("VoiceDistance"))
		ply:SetVoiceVolumeScale(scaler)
                    if scaler < 0 then
                        scaler = 0
                        end
		ply:SetNWFloat("TalkIcanScaler", scaler)
	end
end
--Player:SetVoiceVolumeScale( number )
end)--]]

	hook.Add('PostPlayerDraw', 'TalkIcon', function(ply)
		local range = ply:GetNWFloat("VoiceDistance")
		--print(range)
		if range == 100 then
			voice_mat = Material('talkicon1/voice1.png')
		elseif range == 250 then
			voice_mat = Material('talkicon1/voice2.png')
			elseif range == 650 then
			voice_mat = Material('talkicon1/voice3.png')
			elseif range == 1200 then
			voice_mat = Material('talkicon1/voice4.png')
		elseif range == 10000 then
			voice_mat = Material('talkicon1/voice5.png')
		end



		if ply == LocalPlayer() and GetViewEntity() == LocalPlayer() then return end
		if not ply:Alive() then return end
		if not ply:IsSpeaking() and not (showtextchat:GetBool() and ply:GetNW2Bool('ti_istyping')) then return end
		if ply:GetNWString("EngrammaOf") ~="" and ply:GetNWString("EngrammaOf")~= LocalPlayer():Name() then return end

		local pos = ply:GetPos() + Vector(0, 0, ply:GetModelRadius() + 15)

		local attachment = ply:GetAttachment(ply:LookupAttachment('eyes'))
		if attachment then
			pos = ply:GetAttachment(ply:LookupAttachment('eyes')).Pos + Vector(0, 0, 15)
		end

		render.SetMaterial(ply:IsSpeaking() and voice_mat or text_mat)
		--[[if !trueButtonMonopad then
			render.SetMaterial(pad_mat)
		end--]]
		local color_var = 255

		if computecolor:GetBool() then
			local computed_color = render.ComputeLighting(ply:GetPos(), Vector(0, 0, 1))
			local max = math.max(computed_color.x, computed_color.y, computed_color.z)
			color_var = math.Clamp(max * 255 * 1.11, 0, 255)
		end
		--[[if ply == LocalPlayer() then
			ply:SetNWFloat("TalkIcanScaler", 1)
		end--]]

		render.DrawSprite(pos, 12, 12, Color(color_var, color_var, color_var, 255))
	end)

	hook.Add('StartChat', 'TalkIcon', function(isteam)
		if isteam and noteamchat:GetBool() then return end
		net.Start('TalkIconChat')
			net.WriteBool(true)
		net.SendToServer()
	end)

	hook.Add('FinishChat', 'TalkIcon', function()
		net.Start('TalkIconChat')
			net.WriteBool(false)
		net.SendToServer()
	end)

	hook.Add("InitPostEntity", "RemoveChatBubble", function()
		hook.Remove("StartChat", "StartChatIndicator")
		hook.Remove("FinishChat", "EndChatIndicator")
	end)

end
print("load talkicon")