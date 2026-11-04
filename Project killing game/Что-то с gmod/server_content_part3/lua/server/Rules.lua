util.AddNetworkString("MonoRules")
util.AddNetworkString("UserRules")
util.AddNetworkString("GetRules")
util.AddNetworkString("SetRules")
util.AddNetworkString("LoopersPosition")
util.AddNetworkString("LoopersPositionZap")
util.AddNetworkString("Foto")
util.AddNetworkString("FotoClient")
util.AddNetworkString("DarkUsers")

resource.AddFile("sound/models/sf_block_red_lod1.vmt")

local rules = {"Правила поведения.",
"У общественной школьной жизни в Академии Одарённых Узников нет даты завершения.",
"После совершения убийства будет проведён классный суд. Участие в нём является обязательным для всех выживших учеников.", 
"Если во время суда удастся определить преступника, то только он будет казнён.",
"Если во время суда не удастся определить преступника или же будет определён невиновный, будут казнены все, кроме виновного.",
"Если преступник переживает классный суд, он будет признан победителем. Ему будет дана возможность окончить Абсолютную Академию и выйти во внешний мир.",
"Если невинные продолжат побеждать, игра будет продолжаться, пока не останется двое участников.",
"Насилие против Монокумы, директора Академии, строго запрещено.",
"Монокума никогда не будет напрямую вмешиваться в убийства.",
"Ваши Монопады - ценные вещи. Убедитесь, что не повредите их.",
"Объявление об обнаружении тела проигрывается, когда трое или более учеников находят тело.",
"Ученики могут исследовать школу по своему желанию. В этом нет никаких ограничений.",
"Преступник может убить максимум двух людей.",
"Если два разных убийства с двумя разными убийцами, виновным будет признан тот, чья жертва была обнаружена первой.",
"Директор может добавлять правила в любое время."}
--local rules = {"Правила поведения","Монокума не помогает в убийствах.","Запрещенно наносить вред Монокуме.","Объявление об Обнаружении Тела будет проигрываться, как только трое или больше учеников обнаружат труп в первый раз.","Сон не в своей комнате запрещен и пресекается.","Учитывая минимальные ограничения, вы можете свободно исследовать Академию как хотите.","Каждый, кто убьет ученика, 'окончит школу', если его не обнаружат.","Классный суд начинается вскоре после совершения убийства. Участие в суде является обязательным для всех оставшихся в живых учеников.","Если почерневший будет раскрыт на суде, то только он будет казнён.","Почерневший может убить максимум двух людей.","Уничтожение любой собственности на территории академии строго запрещено, в том числе мониторов и камер наблюдения.","Монокума может добавлять правила по мере необходимости."}

net.Receive("MonoRules", function ()
     local tabl = net.ReadTable()
     rules = tabl
     net.Start("SetRules")
     net.WriteTable(tabl)
     net.Broadcast()
      net.Start("UserRules")
      net.WriteTable(rules)
      net.Broadcast()
  end)


net.Receive("GetRules", function (len,ply)
       net.Start("UserRules")
	net.WriteTable(rules)
	net.Send(ply)
  end)

hook.Add( "PlayerSpawn", "InitRules", function( ply, inflictor)
       net.Start("SetRules")
       net.WriteTable(rules)
       net.Send(ply)
end )

net.Receive("LoopersPositionZap", function (len,ply)
    for i,v in ipairs(player.GetAll()) do
      v:SetNWVector("Position", v:GetPos())
      v:SetNWVector("ShootPos", v:GetShootPos())
    end
end)

net.Receive("DarkUsers", function (len,ply)
    for i,v in ipairs(player.GetAll()) do

      v:ScreenFade( SCREENFADE.OUT, Color( 0,0,0, 255 ), 2.1, 0 )
      v:ScreenFade( SCREENFADE.STAYOUT, Color( 0,0,0, 255 ),5000,0)

    end
end)

net.Receive("LoopersPosition", function (len,ply)
    for i,v in ipairs(player.GetAll()) do
      v:SetPos(v:GetNWVector("Position"))
      v:SetEyeAngles((v:GetNWVector("ShootPos")):Angle())
      v:SetNWString("SosText", "")
      v:SetNWBool("SosBool",false)
    end
    for k,v in ipairs(ents.GetAll()) do
        if (v:GetModel() == "*44") then
            v:SetNWString("Owner", "Shinji")
        elseif (v:GetModel() == "*43") then
            v:SetNWString("Owner", "Sayaka")
        elseif (v:GetModel() == "*45") then
            v:SetNWString("Owner", "Kokichi")
        elseif (v:GetModel() == "*42") then
            v:SetNWString("Owner", "Kaede")
        elseif (v:GetModel() == "*41") then
            v:SetNWString("Owner", "Mondo")
        elseif (v:GetModel() == "*40") then
            v:SetNWString("Owner", "Yasuhiro")
        elseif (v:GetModel() == "*39") then
            v:SetNWString("Owner", "Aoi")
        elseif (v:GetModel() == "*38") then
            v:SetNWString("Owner", "Iroha")
        elseif (v:GetModel() == "*37") then
            v:SetNWString("Owner", "Ibuki")
        elseif (v:GetModel() == "*35") then
            v:SetNWString("Owner", "Peko")
        elseif (v:GetModel() == "*34") then
            v:SetNWString("Owner", "Yuki")
        elseif (v:GetModel() == "models/anthon/door_new.mdl") then
            v:SetNWString("Owner", "Sayaka")
        elseif (v:GetModel() == "*36") then
            v:SetNWString("Owner", "Nagito")
        elseif (v:GetModel() == "*33") then
            v:SetNWString("Owner", "Kokoro")
        end
    end
end)

net.Receive("Foto", function (len,ply)
    net.Start("FotoClient")
    net.Broadcast()
end)

print("MonoRules save")