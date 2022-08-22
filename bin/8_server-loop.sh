#!/usr/bin/env bash
cd "$(dirname "$0")"

folder="../docs/tiles"
myip="$(hostname -I | cut -d' ' -f1)"
mainip="168.119.98.135"
mainurl="http://${mainip}:8080/files"



echo -n "check germany.mbtiles … "

if [[ ! -f "${folder}/germany.mbtiles" ]]
then
	echo -n "is missing … start download … "
	if [ $myip == $mainip ]
	then
		wget -q "https://storage.googleapis.com/datenhub-net-static/tiles/germany.mbtiles" -O "${folder}/germany.mbtiles.tmp"
	else
		wget -q "${mainurl}/germany.mbtiles" -O "${folder}/germany.mbtiles.tmp"
	fi
	mv "${folder}/germany.mbtiles.tmp" "${folder}/germany.mbtiles"
fi
echo "✅"



echo -n "check buffered.tar … "

if [ $myip == $mainip ]
then
	if [[ ! -f "${folder}/buffered.tar" ]]
	then
		echo -n "is missing: please generate one ❗️"
		exit 1
	fi
else
	if [[ ! -f "${folder}/buffered.tar" ]]
	then
		echo -n "is missing … start download … "
		wget -q "${mainurl}/buffered.tar" -O "${folder}/buffered.tar.tmp"
		mv "${folder}/buffered.tar.tmp" "${folder}/buffered.tar"
	else
		filesize1="$(stat --printf="%s" "${folder}/buffered.tar")"
		filesize2="$(curl -sI "${mainurl}/buffered.tar" | grep -i Content-Length | awk '{printf "%i",$2}')"
		echo -n "compare filesizes ${filesize1}/${filesize2} … "
		if [ $filesize1 != $filesize2 ]
		then
			echo -n "unequal … start download … "
			wget -q "${mainurl}/buffered.tar" -O "${folder}/buffered.tar.tmp"
			mv "${folder}/buffered.tar.tmp" "${folder}/buffered.tar"
		fi
	fi
fi
echo "✅"



echo "start server"

while true
do
	git pull
	if [ $myip == $mainip ]
	then
		node 8_server.js main || true
	else
		node 8_server.js node || true
	fi
	echo "restart $(date -Iseconds)"
done
