

GM = GM or GAMEMODE
	util.AddNetworkString("SendLocalMessage")
	util.AddNetworkString("MessageTextChat")
	util.AddNetworkString("LoadSaveMap")
	util.AddNetworkString("EngJap")
	util.AddNetworkString("SavesServer")
	util.AddNetworkString("GetSavesServer")
	util.AddNetworkString("GetModelClientChange")
	util.AddNetworkString("GetModelServerChange")
	util.AddNetworkString("GetOneGluhServerChange")
	util.AddNetworkString("GetGluhServerChange")
	util.AddNetworkString("SendAvtoritet")

local arc = nil

local gluh = ""
local nemoi = ""

local obGluh = ""

net.Receive("SendAvtoritet", function(len,ply)
	print("Кто z")
    local avto = net.ReadFloat()
    ply:SetNWFloat("Avtoritet",ply:GetNWFloat("Avtoritet")-avto)
	local Say = {}
    table.Add(Say, {Color(255, 0, 0), ply:Nick() .. ": "} )
    table.Add(Say, {Color(255,255,255), "отдал " .. avto .. " авторитета"} )
    for k, v in ipairs( player.GetAll() ) do
		if v:IsSuperAdmin() then
			net.Start("SendLocalMessage")
            net.WriteTable(Say)
            net.Send(v)
		end
	end
end)

net.Receive("GetModelServerChange", function(len, ply)
	local tab = net.ReadTable()
	local pl = ""
	for k,v in ipairs(player.GetAll()) do
		if v:Name() == tab[1] then
			pl = v
		end
	end
	if (pl != "") then
		net.Start("GetModelClientChange")
		net.WriteTable({tab[2],tab[3]})
		net.Send(pl)
	end
end)

net.Receive("GetOneGluhServerChange", function(len, ply)
	local tab = net.ReadTable()
	gluh = tab[1]
	nemoi = tab[2]
end)

net.Receive("GetGluhServerChange", function(len, ply)
	local tab = net.ReadTable()
	obGluh = tab[1]
end)

function NoSuicide( ply )
	if(!ply:IsSuperAdmin()) then
	    return false
	else
		return true
	end
end

hook.Add( "CanPlayerSuicide", "Suicide", NoSuicide )

concommand.Add( "loadsaveonserver", function( ply, cmd, args )
    f = file.Find( "saves/*.gms", "MOD", "datedesc" )
	RunConsoleCommand( "gm_load", "saves/" .. f[1] )
end )

concommand.Add( "getfuturesuperadmins", function( ply, cmd, args )
    for _, ply in ipairs( player.GetAll() ) do
		print( ply:Name(), ply:SteamID() )
	end
end )

net.Receive("SavesServer", function(len,ply)
	net.Start("GetSavesServer")
	net.WriteTable(file.Find( "saves/*.gms", "MOD", "datedesc" ))
	net.Send(ply)
end)

net.Receive("LoadSaveMap", function()
	RunConsoleCommand( "gm_load", "saves/" .. net.ReadString() )
end)

local function RandomCharacters(text, ply)
	local text2 = ""
    local sleep = ply:GetNWFloat("PlayerSleep")
    local i = 1
    while i ~= 500 do
    	if sleep <= 25 then
        	local rn = math.random(1,25)
        	if rn > sleep*100 and text[i] ~= '\n' and text[i] ~= nil then
        	else
            	text2 = text2..text[i]
        	end
    	end
    	i = i + 1
    end
	return text2
end

	net.Receive ("MessageTextChat", function(len,ply)
    	hook.Call("PlayerSay",nil,ply,net.ReadString())
    end)

local function ChatCommand(ply,text,public)
	local distRoom = 250
	local distNorm = 500
	if(string.lower(string.sub(text, 1, 3)) == "!ls") or (string.lower(string.sub(text, 1, 3)) == "!pm" or string.lower(string.sub(text, 1, 3)) == "/ls") or (string.lower(string.sub(text, 1, 3)) == "/pm") then
		local alb = string.find(string.sub(text, 5), " ")
		local nocom = string.sub(string.sub(text, 5), alb);
		local nick = string.lower(string.sub(string.sub(text, 5), 1, alb-1))
		for k,v in ipairs(player.GetAll()) do
			local alb1 = string.find(v:Nick(), " ")
			local nick1 = ""
			if alb1 == nil then
				nick1 = v:Nick()
			end
			if alb1 ~= nil then
				nick1 = string.lower(string.sub(v:Nick(), 1, alb1-1))
			end
			if nick1==nick then
				nick=v:Nick()
			end
		end
        local Say = {}
        table.Add(Say, {Color(245, 171, 254), ply:Nick() .. " для " .. nick} )
       -- table.Add(Say, {Color(162, 213, 252), " пишет вам: "} )
        table.Add(Say, {Color(255,255,255), ": " .. string.sub(nocom, 2)} )
		for k,v in ipairs(player.GetAll()) do
			if string.lower(v:Nick())==string.lower(nick) then
				net.Start("SendLocalMessage")
                net.WriteTable(Say)
                net.Send(v)
			end
		end
        Say = {}
        table.Add(Say, {Color(245, 171, 254), ply:Nick() .. " для " .. nick} )

        table.Add(Say, {Color(255,255,255), ": "..string.sub(nocom, 2)} )
        net.Start("SendLocalMessage")
        net.WriteTable(Say)
        net.Send(ply)
		return ""
	end

	
	if(string.lower(string.sub(text, 1, 4)) == "help") then
		ply:PrintMessage(HUD_PRINTTALK, "Команды для RP:")
		ply:PrintMessage(HUD_PRINTTALK, "- /i или /me - действие от лица персонажа. Пример: /i взял лом - Рантаро взял лом")
		ply:PrintMessage(HUD_PRINTTALK, "- /ev или /do - действие от 3-го лица. Пример: Из кухни исходит запах горелого")
		ply:PrintMessage(HUD_PRINTTALK, "- /att или /try  - попытка совершить действие. Пример: Рантаро неудачно взломал замок в комнату Каэде")
		ply:PrintMessage(HUD_PRINTTALK, "- /dice или /roll - случайное число от 1 до 100. Пример: Каэде выпало число: 69.")
		ply:PrintMessage(HUD_PRINTTALK, "- !ls или !pm + имя персонажа - написать сообщение определённому человеку. Пример: !ls Рантаро го убийство сделаем")
        ply:PrintMessage(HUD_PRINTTALK, "- !gm - написать ГМ'у. !admin - администратору.")
		ply:PrintMessage(HUD_PRINTTALK, "- Команды через ! - действуют в небольшом радиусе")
		ply:PrintMessage(HUD_PRINTTALK, "- Команды через / - действуют в большом радиусе")
        ply:PrintMessage(HUD_PRINTTALK, "- Сообщения через / - видны в небольшом радиусе (локальный чат). Такие сообщения пишутся голубым")
        ply:PrintMessage(HUD_PRINTTALK, "- Сообщения через // - видны всем. (глобальный чат)")
        ply:PrintMessage(HUD_PRINTTALK, "- Чтобы узнать время, нажмите N или M")
        ply:PrintMessage(HUD_PRINTTALK, "- Чтобы посмотреть список найденных вами улик, нажмите F2")
        ply:PrintMessage(HUD_PRINTTALK, "- Чтобы посмотреть правила в монопаде, нажмите num0 или num1")
        ply:PrintMessage(HUD_PRINTTALK, "- Чтобы сменить BodyGroups, нажмите num4")
        ply:PrintMessage(HUD_PRINTTALK, "- Чтобы перевыбрать персонажа, нажмите num7")
        ply:PrintMessage(HUD_PRINTTALK, "- Чтобы включить/выключить отображение здоровья, нажмите K, или num2")
        ply:PrintMessage(HUD_PRINTTALK, "- Чтобы изменить дальность разговора, нажмите Alt+1/2/3/4")
        --ply:PrintMessage(HUD_PRINTTALK, "- Чтобы поставить себе статус, отображаемый при взгляде на вас, нажмите "'/'" на нумпаде.")
        ply:PrintMessage(HUD_PRINTTALK, "- Если на игре будут использоваться мономонеты, нажмите f9, чтобы посмотреть их количество. f11 чтобы передать.")

		return ""
	end
    
	local dist
	if text[1] == "!" then
        dist = distRoom
    end
    if text[1] == "/" then
        dist = distNorm
    end


    if(string.lower(string.sub(text, 2,3))=="gm") then
        local Say = {}
        table.Add(Say, {Color(255, 0, 0), ply:Nick() .. ": "} )
        table.Add(Say, {Color(255,255,255), string.sub(text, 4)} )
        for k, v in ipairs( player.GetAll() ) do
			if v:IsSuperAdmin() then
				net.Start("SendLocalMessage")
                net.WriteTable(Say)
                net.Send(v)
			end
		end
		net.Start("SendLocalMessage")
        net.WriteTable(Say)
        net.Send(ply)
        return ""
    end
    
    if(string.lower(string.sub(text, 2,6))=="admin") then
        local Say = {}
        table.Add(Say, {Color(255, 0, 0), ply:Nick() .. ": "} )
        table.Add(Say, {Color(255,255,255), string.sub(text, 4)} )
        for k, v in ipairs( player.GetAll() ) do
			if v:IsAdmin() then
				net.Start("SendLocalMessage")
                net.WriteTable(Say)
                net.Send(v)
			end
		end
		net.Start("SendLocalMessage")
        net.WriteTable(Say)
        net.Send(ply)
        return ""
    end
    
	if(string.lower(string.sub(text, 2,5))=="dice") or (string.lower(string.sub(text, 2,5))=="roll") then
	    local Say = {}
        local rand = math.random(1,100)
				if(ply:Name()!="Импостер" and ply:GetNWString("EngrammaOf") ~= "Невидимость") then
				    table.Add(Say, {Color(240, 230, 140), ply:Name() .. " выпало число: " .. rand } )
				elseif ply:GetNWString("EngrammaOf") == "Невидимость" then
					table.Add(Say, {Color(240, 230, 140), " " .. " выпало число: " .. rand } )
				else
					table.Add(Say, {Color(240, 230, 140), "Бьякуя Тогами" .. " выпало число: " .. rand } )
				end
		for k, v in ipairs( player.GetAll() ) do
			if ((ply:GetPos():Distance(v:GetPos()))<dist and ply:GetNWString("EngrammaOf") == "") or ply:GetNWString("EngrammaOf") == v:Name() or ply == v then
				if(v:Name()==obGluh and v:Name()!=ply:Name()) then

				elseif (v:Name()==gluh and ply:Name()==nemoi) then

				else
					net.Start("SendLocalMessage")
		            net.WriteTable(Say)
		            net.Send(v)
		        end
			end
		end
		return ""
	end
	
 if(string.lower(string.sub(text, 1,4))=="!eng") or (string.lower(string.sub(text, 1,4))=="!jap") then
	    local Say = {}
		table.Add(Say, {Color(240, 230, 140), string.lower(string.sub(text, 2,4))} )
		net.Start("SendLocalMessage")
        net.WriteTable(Say)
        net.Send(ply)
        net.Start("EngJap")
        net.WriteString(string.lower(string.sub(text, 2,4)))
		net.Send(ply)
		return ""
end
    
	if (string.lower(string.sub(text, 2,4))=="att") or (string.lower(string.sub(text, 2,4))=="try") then
        local Say = {}
        local try = math.random(0,1)
        if(ply:Name()!="Импостер" and ply:GetNWString("EngrammaOf") ~= "Невидимость") then 
        if try == 0 then
                    table.Add(Say, {Color(255, 150, 142), ply:Name() .. " неудачно"  .. string.sub(text, 5) } )
                    else 
                    table.Add(Say, {Color(163, 255, 142), ply:Name() .. " удачно"  .. string.sub(text, 5) } )
		end
		elseif ply:GetNWString("EngrammaOf") == "Невидимость" then 
			if try == 0 then
                    table.Add(Say, {Color(255, 150, 142), " " .. " неудачно"  .. string.sub(text, 5) } )
                    else 
                    table.Add(Say, {Color(163, 255, 142), " " .. " удачно"  .. string.sub(text, 5) } )
		end
		else
		if try == 0 then
                    table.Add(Say, {Color(255, 150, 142), "Бьякуя Тогами" .. " неудачно"  .. string.sub(text, 5) } )
                    else 
                    table.Add(Say, {Color(163, 255, 142), "Бьякуя Тогами" .. " удачно"  .. string.sub(text, 5) } )
					end
		end
		for k, v in ipairs( player.GetAll() ) do
			if ((ply:GetPos():Distance(v:GetPos()))<dist and ply:GetNWString("EngrammaOf") == "") or ply:GetNWString("EngrammaOf") == v:Name() or ply == v then
				if(v:Name()==obGluh and v:Name()!=ply:Name()) then

				elseif (v:Name()==gluh and ply:Name()==nemoi) then

				else
					net.Start("SendLocalMessage")
		            net.WriteTable(Say)
		            net.Send(v)
		        end
			end
		end
		return ""
	end
	
	if(string.lower(string.sub(text, 2,2))=="i") then
        local Say = {}
        local rand = math.random(1,100)
				if(ply:Name()!="Импостер" and ply:GetNWString("EngrammaOf") ~= "Невидимость") then
				    table.Add(Say, {Color(0, 166, 226), ply:Name() .. string.sub(text, 3)} )
				elseif ply:GetNWString("EngrammaOf") == "Невидимость" then 
					table.Add(Say, {Color(0, 166, 226), " " .. string.sub(text, 3)} )
				else
					table.Add(Say, {Color(0, 166, 226), "Бьякуя Тогами" .. string.sub(text, 3)} )
				end
		for k, v in ipairs( player.GetAll() ) do
			if ((ply:GetPos():Distance(v:GetPos()))<dist and (ply:GetNWString("EngrammaOf") == "" or ply:GetNWString("EngrammaOf") == "Невидимость")) or ply:GetNWString("EngrammaOf") == v:Name() or ply == v then
				if(v:Name()==obGluh and v:Name()!=ply:Name()) then

				elseif (v:Name()==gluh and ply:Name()==nemoi) then

				else
					net.Start("SendLocalMessage")
		            net.WriteTable(Say)
		            net.Send(v)
		        end
			end
		end
		return ""
	end
    
    if(string.lower(string.sub(text, 2,2))=="t") then
        local Say = {}
			if(ply:Name()!="Импостер" and ply:GetNWString("EngrammaOf") ~= "Невидимость") then 
                table.Add(Say, {Color(255, 100, 120), ply:Nick() .. " говорит: " } )
                table.Add(Say, {Color(255, 255, 255), "'"..string.sub(text, 3) .."'" } )
            elseif ply:GetNWString("EngrammaOf") == "Невидимость" then
            	table.Add(Say, {Color(255, 100, 120), " " .. " говорит: " } )
                table.Add(Say, {Color(255, 255, 255), "'"..string.sub(text, 3) .."'" } )
			else
                table.Add(Say, {Color(255, 100, 120), "Бьякуя Тогами" .. " говорит: " } )
            	table.Add(Say, {Color(255, 255, 255), "'"..string.sub(text, 3) .."'" } )
			end
        for k, v in ipairs( player.GetAll() ) do
			if ((ply:GetPos():Distance(v:GetPos()))<dist and (ply:GetNWString("EngrammaOf") == "" or ply:GetNWString("EngrammaOf") == "Невидимость")) or ply:GetNWString("EngrammaOf") == v:Name() or ply == v then
				if(v:Name()==obGluh and v:Name()!=ply:Name()) then

				elseif (v:Name()==gluh and ply:Name()==nemoi) then

				else
					net.Start("SendLocalMessage")
		            net.WriteTable(Say)
		            net.Send(v)
		        end
			end
		end
	return ""
	end
    
    if(string.lower(string.sub(text, 2,3))=="me" and string.lower(string.sub(text, 2,5))~="menu") then
		local Say = {}
        local rand = math.random(1,100)
				 if(ply:Name()!="Импостер" and ply:GetNWString("EngrammaOf") ~= "Невидимость") then
				    table.Add(Say, {Color(0, 166, 226), ply:Name() .. string.sub(text, 4)} )
				elseif ply:GetNWString("EngrammaOf") == "Невидимость" then
					table.Add(Say, {Color(0, 166, 226), " " .. string.sub(text, 4)} )
				else
					table.Add(Say, {Color(0, 166, 226), "Бьякуя Тогами" .. string.sub(text, 4)} )
				end
		for k, v in ipairs( player.GetAll() ) do
			if ((ply:GetPos():Distance(v:GetPos()))<dist and (ply:GetNWString("EngrammaOf") == "" or ply:GetNWString("EngrammaOf") == "Невидимость")) or ply:GetNWString("EngrammaOf") == v:Name() or ply == v then
				if(v:Name()==obGluh and v:Name()!=ply:Name()) then

				elseif (v:Name()==gluh and ply:Name()==nemoi) then

				else
					net.Start("SendLocalMessage")
		            net.WriteTable(Say)
		            net.Send(v)
		        end
			end
		end
		return ""
	end
	
	if(string.lower(string.sub(text, 2,3))=="ev" or string.lower(string.sub(text, 2,3))=="do" or string.lower(string.sub(text, 2,3))=="it") then
        local Say = {}
        table.Add(Say, {Color(152, 251, 152), string.sub(text, 5) } )
		for k, v in ipairs( player.GetAll() ) do
			if ((ply:GetPos():Distance(v:GetPos()))<dist and (ply:GetNWString("EngrammaOf") == "" or ply:GetNWString("EngrammaOf") == "Невидимость")) or ply:GetNWString("EngrammaOf") == v:Name() or ply == v then
				if(v:Name()==obGluh and v:Name()!=ply:Name()) then

				elseif (v:Name()==gluh and ply:Name()==nemoi) then

				else
					net.Start("SendLocalMessage")
		            net.WriteTable(Say)
		            net.Send(v)
		        end
			end
		end
	return ""
	end

	if(text[1] == "/" and text[2] ~= "/") then
        local Say = {}
        table.Add(Say, {Color(162, 213, 252), ply:Nick() .. ": "} )
        table.Add(Say, {Color(255,255,255), string.sub(text, 2)} )
		for k, v in ipairs( player.GetAll() ) do
			if (ply:GetPos():Distance(v:GetPos()))<distNorm then
                net.Start("SendLocalMessage")
                net.WriteTable(Say)
                net.Send(v)
			end
		end
		return ""   
	elseif(text[1] == "/" and text[2] == "/") then
		local Say = {}
        table.Add(Say, {Color(255, 255, 0), ply:Nick() .. ": "} )
        table.Add(Say, {Color(255,255,255), string.sub(text, 3)} )
        net.Start("SendLocalMessage")
        net.WriteTable(Say)
        net.Broadcast()
		return ""
	else
		return ""
	end
end

local microphones = {}


--hook.Add('PlayerSay','ChatCommand',ChatCommand)
hook.Add('PlayerSay','ChatCommand',ChatCommand)

--[[local function SendVoiceToPlayer(listener, talker)
	--print(talker:Name().."2")
	net.Start('SetPlayerVolume')
	--net.WriteString(talker:Name())
	net.WriteEntity(talker)
	net.Send(listener)
	print("send")
end--]]

hook.Add( "PlayerCanHearPlayersVoice", "Maximum Range", function( listener, talker )
	for k,v in ipairs(microphones) do
		if(v:IsValid()) then
		if(talker:GetPos():Distance(v:GetPos())<120 and v:GetWork()==2) then
			return true
		end
		end
	end

	if(listener:Name() == gluh and talker:Name() == nemoi) then
		return false
	end

	if(listener:Name() == obGluh) then
		return false
	end

	if (talker:GetNWString("PhoneCall") ~= nill and talker:GetNWString("PhoneCall")~= "") and listener:GetNWString("PhoneCall") == talker:GetNWString("PhoneCall") then
		return true
	end

	if (listener ~= talker) then
	    if (talker:GetNWFloat("VoiceDistance") > 0 and talker:GetNWFloat("VoiceDistance") < 1300 and talker:GetNWString("EngrammaOf") == "") or talker:GetNWString("EngrammaOf") == listener:Name() then
	    		local range1 = listener:GetPos():Distance(talker:GetPos())
				local range2 = (talker:GetNWFloat("VoiceDistance"))
				--[[if range2 == 200 then
					range2 = 250
				else 
					range2 = range2+200
				end--]]
	    		--[[if (range1<range2) then
	    		net.Start('SetPlayerVolume')
				net.WriteEntity(talker)
				net.Send(listener)
			end--]]
			return (range1<range2), true
		end
        if talker:GetNWFloat("VoiceDistance") == 10000  then
        	net.Start('SetGlobalPlayerVolume')
			net.WriteEntity(talker)
			net.Send(listener)
			return true
		end

		if talker:GetNWFloat("VoiceDistance") == 0 and listener:GetNWString("EngrammaOf") == talker:Name() then
			return true
		end
		return false
	end
			--
end )

hook.Add( "OnEntityCreated", "MicroSpawn", function( ent )
	if ( ent:GetClass() == "micro" ) then
		if(microphones[1] == nil) then
			microphones[1] = ent
		else
			local numberMicro = 0
			for k,v in ipairs(microphones) do
				numberMicro = numberMicro+1
			end
			microphones[numberMicro+1] = ent
		end
	end
end )

hook.Add("PlayerDroppedWeapon", "PrintWhenDrop", function(owner, wep)
    if(wep:GetPrintName()=="Hands") then
            owner:Give("re_hands",false)
    end
end)

print("CharScriptSaved")